import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const skins = [];

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 30,

    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    },

    async requestHandler({ page, request, enqueueLinks }) {
        try {
            await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // poczekaj aż coś się pojawi
            await page.waitForTimeout(3000);

            // =====================
            // SCRAPING
            // =====================
            const items = await page.evaluate(() => {
                const result = [];

                const cards = document.querySelectorAll('.workshopItem');

                cards.forEach(el => {
                    const name = el.querySelector('.workshopItemTitle')?.innerText;
                    const link = el.querySelector('a')?.href;
                    const img = el.querySelector('img')?.src;

                    if (name || img) {
                        result.push({
                            name,
                            link,
                            img
                        });
                    }
                });

                return result;
            });

            for (const item of items) {
                skins.push({
                    name: item.name,
                    link: item.link,
                    images: {
                        preview: item.img
                    }
                });
            }

            // =====================
            // NEXT PAGE
            // =====================
            const nextUrl = await page.evaluate(() => {
                const btns = document.querySelectorAll('.workshopBrowsePagingControls a');
                if (!btns.length) return null;
                return btns[btns.length - 1].href;
            });

            if (nextUrl) {
                await enqueueLinks({ urls: [nextUrl] });
            }

        } catch (err) {
            console.log('Page error:', err.message);
        }
    }
});

await crawler.run([
    'https://steamcommunity.com/workshop/browse/?appid=730&section=readytouseitems'
]);

// =====================
// FINAL JSON
// =====================
const final = {
    meta: {
        source: "Steam Workshop Playwright FIXED",
        generated_at: new Date().toISOString()
    },
    skins_db: skins
};

await Actor.pushData(final);

await Actor.exit();
