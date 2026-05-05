import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

// =====================
// STORAGE
// =====================
const knowledge = [];
const skins = [];

// =====================
// 1. CRAWL CS2 WORKSHOP
// =====================
const crawler = new CheerioCrawler({
    async requestHandler({ $, request }) {

        const text = $('body').text();

        const links = [];
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('counter-strike.net')) {
                links.push(href);
            }
        });

        knowledge.push({
            url: request.url,
            text: text.slice(0, 5000),
            links
        });
    },
    maxRequestsPerCrawl: 50
});

await crawler.run([
    'https://www.counter-strike.net/workshop/workshop'
]);

// =====================
// 2. COLOR HEURISTIC
// =====================
function estimateColorFromUrl(url = '') {
    const lower = url.toLowerCase();

    const colors = [];

    if (lower.includes('red')) colors.push('red');
    if (lower.includes('blue')) colors.push('blue');
    if (lower.includes('black')) colors.push('black');
    if (lower.includes('white')) colors.push('white');
    if (lower.includes('gold')) colors.push('gold');

    return colors;
}

// =====================
// 3. STEAM API (FULL FIXED SAFE MODE)
// =====================
let start = 0;
const limit = 100;

while (start < 500) {

    try {
        const params = new URLSearchParams({
            appid: '730',
            numperpage: limit.toString(),
            startindex: start.toString(),
            return_tags: '1',
            return_metadata: '1'
        });

        const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params.toString()}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });

        const text = await res.text();

        // 🚨 SAFE PARSE (Steam czasem zwraca HTML)
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.log('Steam API blocked or invalid response → stopping');
            break;
        }

        const items = data?.response?.publishedfiledetails || [];

        if (!items.length) break;

        for (const item of items) {

            const preview = item.preview_url || null;
            const icon = item.preview_file_url || null;

            const tags = item.tags?.map(t => t.tag) || [];

            skins.push({
                id: item.publishedfileid,
                name: item.title,
                description: item.description,
                tags,

                images: {
                    preview,
                    icon
                },

                pattern: {
                    tags_related: tags.filter(t =>
                        t.toLowerCase().includes('pattern') ||
                        t.toLowerCase().includes('finish') ||
                        t.toLowerCase().includes('wear')
                    ),

                    visual_guess: estimateColorFromUrl(preview || '')
                }
            });
        }

        start += limit;

    } catch (err) {
        console.log('Steam API error:', err.message);
        break;
    }
}

// =====================
// 4. STATISTICS
// =====================
const tagStats = {};
const colorStats = {};

for (const skin of skins) {

    for (const tag of skin.tags || []) {
        tagStats[tag] = (tagStats[tag] || 0) + 1;
    }

    for (const c of skin.pattern.visual_guess || []) {
        colorStats[c] = (colorStats[c] || 0) + 1;
    }
}

// =====================
// 5. FINAL OUTPUT
// =====================
const final = {
    meta: {
        source: "CS2 Workshop + Steam API",
        mode: "stable scraper (fixed version)",
        generated_at: new Date().toISOString()
    },

    knowledge_base: knowledge,

    skins_db: skins,

    visual_intelligence: {
        tag_distribution: tagStats,
        color_distribution: colorStats
    }
};

await Actor.pushData(final);

await Actor.exit();
