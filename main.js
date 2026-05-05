import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

// =====================
// STORAGE
// =====================
const knowledge = [];
const skins = [];

// =====================
// 1. CS2 WORKSHOP CRAWL (OFFICIAL SITE)
// =====================
const csCrawler = new CheerioCrawler({
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

await csCrawler.run([
    'https://www.counter-strike.net/workshop/workshop'
]);

// =====================
// 2. STEAM WORKSHOP HTML (NO API - STABLE)
// =====================
const steamCrawler = new CheerioCrawler({
    async requestHandler({ $, request }) {

        const items = $('.workshopItem');

        items.each((_, el) => {

            const name = $(el).find('.workshopItemTitle').text().trim();
            const img = $(el).find('img').attr('src');
            const link = $(el).find('a').attr('href');

            const tags = [];

            $(el).find('.workshopTags a').each((_, tagEl) => {
                tags.push($(tagEl).text().trim());
            });

            skins.push({
                name,
                link,
                tags,
                images: {
                    preview: img || null
                },

                pattern: {
                    tags_related: tags.filter(t =>
                        t.toLowerCase().includes('pattern') ||
                        t.toLowerCase().includes('finish') ||
                        t.toLowerCase().includes('wear')
                    )
                }
            });
        });
    },
    maxRequestsPerCrawl: 5
});

// Steam browse page (HTML stable source)
await steamCrawler.run([
    'https://steamcommunity.com/workshop/browse/?appid=730&section=readytouseitems'
]);

// =====================
// 3. SIMPLE ANALYSIS
// =====================
const tagStats = {};

for (const skin of skins) {
    for (const tag of skin.tags || []) {
        tagStats[tag] = (tagStats[tag] || 0) + 1;
    }
}

// =====================
// 4. FINAL JSON
// =====================
const final = {
    meta: {
        source: "CS2 Workshop + Steam HTML",
        mode: "stable-no-api-version",
        generated_at: new Date().toISOString()
    },

    knowledge_base: knowledge,

    skins_db: skins,

    visual_intelligence: {
        tag_distribution: tagStats
    }
};

await Actor.pushData(final);

await Actor.exit();
