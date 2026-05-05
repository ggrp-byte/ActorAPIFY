import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';
import fetch from 'node-fetch';

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
// 2. COLOR ANALYSIS (lightweight)
// =====================
function estimateColorFromUrl(url) {
    // bardzo uproszczone: heurystyka na podstawie nazwy pliku
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
// 3. STEAM API (FULL + IMAGES)
// =====================
let start = 0;
const limit = 100;

while (start < 500) { // możesz zwiększyć
    const res = await fetch(
        'https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/',
        {
            method: 'POST',
            body: new URLSearchParams({
                appid: 730,
                numperpage: limit,
                startindex: start,
                return_tags: true,
                return_metadata: true
            })
        }
    );

    const data = await res.json();
    const items = data?.response?.publishedfiledetails || [];

    if (items.length === 0) break;

    for (const item of items) {

        const preview = item.preview_url || item.url || null;
        const icon = item.preview_file_url || null;

        const tags = item.tags?.map(t => t.tag) || [];

        skins.push({
            id: item.publishedfileid,
            name: item.title,
            description: item.description,
            tags,

            // 🖼️ IMAGES
            images: {
                preview,
                icon
            },

            // 🎨 pattern approximation
            pattern: {
                tags_related: tags.filter(t =>
                    t.includes('pattern') ||
                    t.includes('finish') ||
                    t.includes('wear')
                ),

                visual_guess: estimateColorFromUrl(preview || '')
            }
        });
    }

    start += limit;
}

// =====================
// 4. STYLE ANALYSIS (no AI, only stats)
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
// 5. FINAL JSON
// =====================
const final = {
    meta: {
        source: "CS2 Workshop + Steam API",
        mode: "no-ai-statistical-analysis",
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
