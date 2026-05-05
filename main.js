import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

// Zbiory wynikowe
const knowledgeBase = [];
const skinsDb = [];

// ===================== 1. CRAWLER =====================
console.log('🕷️ Rozpoczynam skanowanie CS2 Workshop...');

let crawler;
try {
    const requestQueue = await Actor.openRequestQueue();

    // Dodaj stronę startową
    await requestQueue.addRequest({
        url: 'https://www.counter-strike.net/workshop/workshop',
    });

    crawler = new CheerioCrawler({
        requestQueue,
        maxRequestsPerCrawl: 200, // zwiększ lub zmniejsz wg potrzeb
        maxRequestRetries: 2,

        async requestHandler({ $, request }) {
            const title = $('title').text().trim();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

            knowledgeBase.push({
                url: request.url,
                title,
                textPreview: bodyText.slice(0, 8000), // zachowaj pierwsze 8000 znaków
                crawledAt: new Date().toISOString(),
            });

            // Odkrywaj linki wewnętrzne i dodawaj do kolejki
            const links = [];
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('https://www.counter-strike.net')) {
                    links.push({ url: href });
                }
            });

            if (links.length > 0) {
                await crawler.addRequests(links);
            }
        },
    });

    await crawler.run();
    console.log(`✅ Crawlowanie zakończone. Znaleziono ${knowledgeBase.length} stron.`);
} catch (err) {
    console.error('❌ Błąd podczas crawlowania:', err.message);
    // Nie przerywaj aktora – przejdź do API Steam
}

// ===================== 2. STEAM API =====================
console.log('🖼️ Pobieranie danych z Steam Workshop API...');

let startIndex = 0;
const perPage = 100;
const maxItems = 2000; // maksymalna liczba skinów do pobrania (zmień w razie potrzeby)

while (startIndex < maxItems) {
    const apiUrl = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?appid=730&numperpage=${perPage}&startindex=${startIndex}&return_tags=1&return_metadata=1&key=`; // klucz nie jest wymagany dla publicznych danych

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.error(`Steam API zwrócił status ${response.status}. Przerywam.`);
            break;
        }

        const data = await response.json();
        const items = data?.response?.publishedfiledetails;

        if (!items || items.length === 0) {
            console.log('Brak nowych rekordów – koniec pobierania.');
            break;
        }

        for (const item of items) {
            const previewUrl = item.preview_url || '';
            const iconUrl = item.preview_file_url || '';

            // Prosta heurystyka kolorów z URL obrazka
            const colors = [];
            const lowUrl = previewUrl.toLowerCase();
            if (lowUrl.includes('red')) colors.push('red');
            if (lowUrl.includes('blue')) colors.push('blue');
            if (lowUrl.includes('black')) colors.push('black');
            if (lowUrl.includes('white')) colors.push('white');
            if (lowUrl.includes('gold')) colors.push('gold');
            if (lowUrl.includes('green')) colors.push('green');
            if (lowUrl.includes('purple')) colors.push('purple');

            const tags = (item.tags || []).map(t => t.tag);
            const patternTags = tags.filter(t =>
                /pattern|finish|wear|camo|spray|marble|fade|case|hardened/i.test(t)
            );

            skinsDb.push({
                id: item.publishedfileid,
                title: item.title,
                description: item.description || '',
                tags,
                images: {
                    preview: previewUrl || null,
                    icon: iconUrl || null,
                },
                pattern_guess: {
                    related_tags: patternTags,
                    dominant_colors: colors,
                },
            });
        }

        startIndex += perPage;
        console.log(`   Pobrano ${skinsDb.length} skinów…`);

        // Czekaj 0.5 sekundy między zapytaniami, aby nie przeciążać API
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
        console.error('❌ Błąd podczas zapytania Steam API:', err.message);
        break;
    }
}

console.log(`✅ Pobrano łącznie ${skinsDb.length} rekordów z API Steam.`);

// ===================== 3. ANALIZA STATYSTYCZNA =====================
const tagCounts = {};
const colorCounts = {};

for (const skin of skinsDb) {
    for (const tag of skin.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    for (const col of skin.pattern_guess.dominant_colors) {
        colorCounts[col] = (colorCounts[col] || 0) + 1;
    }
}

// ===================== 4. FINALNY JSON =====================
const finalOutput = {
    meta: {
        source: 'CS2 Workshop + Steam API (public)',
        generated_at: new Date().toISOString(),
        total_pages_crawled: knowledgeBase.length,
        total_skins_fetched: skinsDb.length,
    },
    knowledge_base: knowledgeBase,
    skins_database: skinsDb,
    visual_intelligence: {
        tag_distribution: tagCounts,
        color_distribution: colorCounts,
    },
};

try {
    await Actor.pushData(finalOutput);
    console.log('🎉 Dane zapisane w Dataset!');
} catch (err) {
    console.error('❌ Błąd zapisu danych:', err.message);
}

await Actor.exit();
