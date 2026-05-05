import { Actor } from 'apify';
import { CheerioCrawler, RequestQueue } from 'crawlee';

await Actor.init();

// Przechowalnie zebranych danych
const knowledgeBase = [];
const skinsDb = [];

console.log('🔍 Rozpoczynam skanowanie CS2 Workshop...');

// 1. CRAWLER – zbieranie treści z głównej strony i podstron
const requestQueue = await RequestQueue.open();
await requestQueue.addRequest({ url: 'https://www.counter-strike.net/workshop/workshop' });

const crawler = new CheerioCrawler({
    requestQueue,
    maxRequestsPerCrawl: 100, // ogranicza liczbę podstron – możesz zwiększyć

    async requestHandler({ $, request }) {
        const pageText = $('body').text().replace(/\s+/g, ' ').trim();

        knowledgeBase.push({
            url: request.url,
            text: pageText.slice(0, 5000), // pierwsze 5000 znaków, aby plik nie był gigantyczny
            crawledAt: new Date().toISOString(),
        });

        // Dodajemy wszystkie linki z domeny counter-strike.net do kolejki
        await crawler.addRequests(
            $('a[href^="https://www.counter-strike.net"]')
                .map((_, el) => ({ url: $(el).attr('href') }))
                .get()
        );
    },
});

await crawler.run();
console.log(`✅ Zakończono crawlowanie. Znaleziono ${knowledgeBase.length} stron.`);

// 2. POBRANIE DANYCH Z STEAM API (warsztat CS2, appid=730)
console.log('🖼️ Pobieranie danych z Steam Workshop API...');

let startIndex = 0;
const perPage = 100; // maksymalnie 100 na zapytanie
const maxItems = 1000; // bezpieczny limit – możesz zwiększyć

while (startIndex < maxItems) {
    const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?appid=730&numperpage=${perPage}&startindex=${startIndex}&return_tags=1&return_metadata=1`;

    let response;
    try {
        response = await fetch(url);
    } catch (err) {
        console.error('❌ Błąd połączenia z Steam API:', err.message);
        break;
    }

    if (!response.ok) {
        console.error(`❌ Steam API zwrócił status ${response.status}`);
        break;
    }

    let data;
    try {
        data = await response.json();
    } catch (err) {
        console.error('❌ Nieprawidłowa odpowiedź JSON:', err.message);
        break;
    }

    const items = data?.response?.publishedfiledetails;
    if (!items || items.length === 0) break;

    for (const item of items) {
        const previewUrl = item.preview_url || '';
        const iconUrl = item.preview_file_url || '';

        // Heurystyka kolorów na podstawie URL obrazka
        const colors = [];
        const lowUrl = previewUrl.toLowerCase();
        if (lowUrl.includes('red')) colors.push('red');
        if (lowUrl.includes('blue')) colors.push('blue');
        if (lowUrl.includes('black')) colors.push('black');
        if (lowUrl.includes('white')) colors.push('white');
        if (lowUrl.includes('gold')) colors.push('gold');

        const tags = (item.tags || []).map(t => t.tag);
        const patternTags = tags.filter(t =>
            /pattern|finish|wear|camo|spray|marble/i.test(t)
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
    console.log(`   Pobrano ${skinsDb.length} skinów...`);
}

console.log(`✅ Pobrano łącznie ${skinsDb.length} rekordów z API Steam.`);

// 3. OBLICZENIE STATYSTYK (bez AI)
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

// 4. KOŃCOWY PLIK JSON
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

// 5. ZAPISZ JAKO JEDEN PLIK W WYNIKACH
await Actor.pushData(finalOutput);

console.log('🎉 Gotowe! Plik JSON zapisany w Dataset.');
await Actor.exit();
