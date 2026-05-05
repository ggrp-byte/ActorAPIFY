import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

// =====================
// STORAGE
// =====================
const knowledge = [];
const skins = [];

// =====================
// 1. SAFE COLOR HEURISTIC
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
// 2. CS2 + STEAM WORKSHOP FULL CRAWLER (RECURSIVE)
// =====================
const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 2000,

    async requestHandler({ $, request, enqueueLinks }) {

        const url = request.url;
        const bodyText = $('body').text();

        // =====================
        // SAVE PAGE DATA
        // =====================
        knowledge.push({
            url,
            text: bodyText.slice(0, 4000)
        });

        // =====================
        // EXTRACT SKINS (STEAM WORKSHOP STYLE BLOCKS)
        // =====================
        $('.workshopItem, .workshop_item, .collectionItem').each((_, el) => {

            const name =
                $(el).find('.workshopItemTitle, .workshop_item_title').text().trim() ||
                $(el).find('h1, h2, h3').first().text().trim();

            const img =
                $(el).find('img').attr('src') ||
                $(el).find('img').attr('data-src');

            const link =
                $(el).find('a').attr('href');

            const tags = [];

            $(el).find('.workshopTags a, .tags a').each((_, t) => {
                tags.push($(t).text().trim());
            });

            if (name || img) {
                skins.push({
                    name: name || 'unknown',
                    link: link || url,

                    tags,

                    images: {
                        preview: img || null
                    },

                    pattern: {
                        tags_related: tags.filter(t =>
                            t.toLowerCase().includes('pattern') ||
                            t.toLowerCase().includes('finish') ||
                            t.toLowerCase().includes('wear')
                        ),

                        visual_guess: estimateColorFromUrl(img || '')
                    }
                });
            }
        });

        // =====================
        // RECURSIVE LINK FOLLOWING (FULL SCRAPE)
        // =====================
        await enqueueLinks({
            selector: 'a',
            globs: [
                'https://www.counter-strike.net/**',
                'https://steamcommunity.com/workshop/**'
            ]
        });
    }
});

// START POINTS
await crawler.run([
    'https://www.counter-strike.net/workshop/workshop',
    'https://steamcommunity.com/workshop/browse/?appid=730'
]);

// =====================
// 3. STATS
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
// 4. FINAL JSON EXPORT (ONE OUTPUT)
// =====================
const final = {
    meta: {
        source: "CS2 FULL SCRAPER FINAL",
        mode: "recursive-html-crawler",
        generated_at: new Date().toISOString()
    },

    knowledge_base: knowledge,

    skins_db: skins,

    visual_intelligence: {
        tag_distribution: tagStats,
        color_distribution: colorStats
    }
};

// SINGLE EXPORT (IMPORTANT)
await Actor.pushData(final);

await Actor.exit();
