import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const skins = [];

// =====================
// PLAYWRIGHT CRAWLER
// =====================
const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 50,
    headless: true,

    async requestHandler({ page, request, enqueueLinks }) {

        await page.waitForLoadState('networkidle');

        // =====================
        // ZBIERANIE SKINÓW
        // =====================
        const items = await page.$$eval('.workshopItem', els =>
            els.map(el => ({
                name: el.querySelector('.workshopItemTitle')?.innerText || null,
                link: el.querySelector('a')?.href || null,
                img: el.querySelector('img')?.src || null
            }))
        );

        for (const item of items) {
            if (item.name || item.img) {
                skins.push({
                    name: item.name,
                    link: item.link,
                    images: {
                        preview: item.img
                    }
                });
            }
        }

        // =====================
        // PAGINATION (NEXT PAGE)
        // =====================
        const nextUrl = await page.evaluate(() => {
            const btn = document.querySelector('.workshopBrowsePagingControls a:last-child');
            return btn ? btn.href : null;
        });

        if (nextUrl) {
            await enqueueLinks({
                urls: [nextUrl]
            });
        }
    }
});

// START URL
await crawler.run([
    'https://steamcommunity.com/workshop/browse/?appid=730&section=readytouseitems'
]);

// =====================
// FINAL JSON
// =====================
const final = {
    meta: {
        source: "Steam Workshop (Playwright)",
        generated_at: new Date().toISOString()
    },
    skins_db: skins
};

await Actor.pushData(final);

await Actor.exit();
