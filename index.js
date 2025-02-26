const { Client, MessageMedia } = require('whatsapp-web.js'); 
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp is ready!');
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

client.on('message', async (msg) => {
    const userMessage = msg.body.trim().toLowerCase();
    
    if (userMessage.startsWith('/search')) {
        await handleSearch(msg, userMessage);
    } else if (userMessage.startsWith('/img')) {
        await handleImageSearch(msg, userMessage);
    }
});

async function handleSearch(msg, userMessage) {
    client.sendPresenceAvailable();
    await msg.reply('...');  // Start typing status
    
    const query = userMessage.replace('/search', '').trim();
    
    if (!query) {
        msg.reply('❌ **You did not enter a search term**. Use `/ <search term>`');
        return;
    }
    
    const searchResults = await getSearchResults(query);
    if (searchResults.length > 0) {
        let response = `🔍 **Search results for "${query}":**\n\n`;
        searchResults.forEach((result, index) => {
            response += `${index + 1}️⃣ **Title**: ${result.title}\n`;
            response += `📝 **Description**: ${result.description}\n`;
            response += `🗓️ **Publish Date**: ${result.publishedDate}\n`;
            response += `📂 **Category**: ${result.category}\n`;
            response += `🔗 **Link**: ${result.link}\n\n`;
        });
        msg.reply(response);
    } else {
        msg.reply(`😔 **I couldn't find accurate results for your search "${query}"**.`);
    }
    client.sendPresenceUnavailable();
}

async function handleImageSearch(msg, userMessage) {
    client.sendPresenceAvailable();
    await msg.reply('...'); // Start typing message

    let [query, numImages = 1] = parseImageQuery(userMessage);

    if (!query) {
        msg.reply('❌ **You did not enter a term for image search**. Use `/img <search term>`');
        return;
    }

    try {
        const imageUrls = await getImageUrls(query, numImages);
        if (imageUrls.length > 0) {
            for (const imageUrl of imageUrls) {
                const imagePath = await downloadImage(imageUrl);
                const imageData = fs.readFileSync(imagePath).toString('base64');
                const media = new MessageMedia('image/jpeg', imageData, 'image.jpg');
                msg.reply(media);
            }
        } else {
            msg.reply(`😔 **I couldn't find images for your search "${query}"**.`);
        }
    } catch (error) {
        console.error('Error handling image search:', error);
        msg.reply('An error occurred while processing your image request!');
    } finally {
        client.sendPresenceUnavailable();
    }
}

function parseImageQuery(userMessage) {
    let query = userMessage.replace('/img', '').trim();
    let numImages = 1;

    if (query.includes('[')) {
        numImages = parseInt(query.split('[')[1].replace(']', '').trim());
        query = query.split('[')[0].trim();
    }

    return [query, numImages];
}

// Function to get search results
async function getSearchResults(query) {
    try {
        const response = await axios.get('https://customsearch.googleapis.com/customsearch/v1', {
            params: {
                q: query,
                cx: 'd6ec631a0bf3d412a', // Replace with your custom search engine ID
                key: 'AIzaSyBjfjAQFDTVONBr8cY3X9HzDdF2GVBlqJY', // Replace with your API Key
            }
        });

        // Parse the search results
        const searchResults = response.data.items.map(item => ({
            title: item.title,
            description: item.snippet,
            publishedDate: item.pagemap?.metatags?.['article:published_time'] || 'Not available',
            category: item.pagemap?.metatags?.['article:section'] || 'Not available',
            link: item.link,
        }));

        return searchResults;
    } catch (error) {
        console.error('Error fetching search results:', error);
        return [];
    }
}

// Function to get image URLs
async function getImageUrls(query, numImages) {
    try {
        const response = await axios.get('https://customsearch.googleapis.com/customsearch/v1', {
            params: {
                q: query,
                cx: 'd6ec631a0bf3d412a', // Replace with your custom search engine ID
                key: 'AIzaSyBjfjAQFDTVONBr8cY3X9HzDdF2GVBlqJY', // Replace with your API Key
                searchType: 'image',
                num: numImages,
            }
        });

        const imageUrls = response.data.items.map(item => item.link);
        return imageUrls;
    } catch (error) {
        console.error('Error fetching image URLs:', error);
        return [];
    }
}

// Function to download image
async function downloadImage(imageUrl) {
    try {
        const response = await axios({
            url: imageUrl,
            responseType: 'stream'
        });
        const imagePath = path.resolve(__dirname, 'image.jpg');
        const writer = fs.createWriteStream(imagePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(imagePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading image:', error);
        throw new Error('Failed to download image');
    }
}

client.initialize();
