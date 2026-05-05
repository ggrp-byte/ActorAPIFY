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
// 2. SIMPLE COLOR HEURISTIC
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
// 3. STEAM API (FIXED GET REQUEST)
// =====================
let start = 0;
const limit = 100;

while (start < 500) {

    const params = new URLSearchParams({
        appid: '730',
        numperpage: limit.toString(),
        startindex: start.toString(),
        return_tags: '1',
        return_metadata: '1'
    });

    const res = await fetch(
        `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params.toString()}`
    );

    const data = await res.json();
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

            // 🖼️ IMAGES
            images: {
                preview,
                icon
            },

            // 🎨 pattern / style approximation
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
}

// =====================
// 4. STATISTICS (NO AI)
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
// 5. FINAL OUTPUT JSON
// =====================
const final = {
    meta: {
        source: "CS2 Workshop + Steam API",
        mode: "statistical scraper (no AI)",
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
