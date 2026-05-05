import { Actor } from 'apify';
import fetch from 'node-fetch';

await Actor.init();

const url = 'https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/';

const response = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({
        appid: 730,
        numperpage: 100,
        return_tags: true,
        return_metadata: true
    })
});

const data = await response.json();

for (const item of data.response.publishedfiledetails || []) {
    await Actor.pushData({
        id: item.publishedfileid,
        title: item.title,
        tags: item.tags,
        description: item.description
    });
}

await Actor.exit();
