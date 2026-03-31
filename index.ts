import { readFeed, setConfig } from './reallysimple.js'

// Increase feed read timeout (default is 10 seconds)
setConfig({ timeOutSecs: 30 });
import { client } from 'davexmlrpc'
import express from 'express'
import http from 'http'
import https from 'https'

// ---- Configuration ----

// Your RSS feed URL (copy from Social Web app: profile > "Copy feed link")
const urlFeed = "http://127.0.0.1:3000/feed?key=userkey"

// This server's public domain (where the rssCloud hub will send notifications)
const callbackDomain = "groupchat.socialweb.cloud"

// The path on this server that receives rssCloud notifications
const callbackPath = "/notify"

// Port this server listens on (Caddy reverse-proxies to this)
const port = parseInt(process.env.PORT || "4008", 10)

// How often to re-subscribe (rssCloud subscriptions expire after 25 hours)
const resubscribeIntervalMs = 24 * 60 * 60 * 1000 // 24 hours

// ---- Types ----

interface GroupChatGroup {
    url: string;
    title: string;
    id: string;
}

interface FeedItem {
    title?: string;
    author?: string;
    pubDate: string;
    enclosure?: {
        url: string;
        type: string;
        length: string;
    };
    'groupchat:group': GroupChatGroup;
}

interface GroupedMessages {
    [groupId: string]: {
        group: GroupChatGroup;
        messages: FeedItem[];
    };
}

interface CloudInfo {
    domain: string;
    port: string;
    path: string;
    registerProcedure: string;
    protocol: string;
}

// ---- Feed parsing ----

function parseGroupChatFeed(): Promise<{ groups: GroupedMessages; cloud?: CloudInfo }> {
    return new Promise((resolve, reject) => {
        readFeed(urlFeed, (err: Error | null, feed: any) => {
            if (err) {
                console.error('Error reading feed:', err.message);
                reject(err);
                return;
            }

            // Extract cloud element for rssCloud subscription
            let cloud: CloudInfo | undefined;
            if (feed.cloud) {
                cloud = {
                    domain: feed.cloud.domain || feed.cloud['@_domain'],
                    port: feed.cloud.port || feed.cloud['@_port'] || '443',
                    path: feed.cloud.path || feed.cloud['@_path'] || '/pleaseNotify',
                    registerProcedure: feed.cloud.registerProcedure || feed.cloud['@_registerProcedure'] || '',
                    protocol: feed.cloud.protocol || feed.cloud['@_protocol'] || 'http-post',
                };
            }

            const groupedMessages: GroupedMessages = {};

            feed.items.forEach((item: FeedItem) => {
                const group = item['groupchat:group'];
                if (group && group.id) {
                    if (!groupedMessages[group.id]) {
                        groupedMessages[group.id] = {
                            group,
                            messages: []
                        };
                    }
                    groupedMessages[group.id].messages.push(item);
                }
            });

            resolve({ groups: groupedMessages, cloud });
        });
    });
}

function printGroupSummary(groups: GroupedMessages) {
    console.log('\nGroups found:');
    Object.values(groups).forEach(({ group, messages }) => {
        console.log(`\nGroup: ${group.title}`);
        console.log(`ID: ${group.id}`);
        console.log(`Message count: ${messages.length}`);
        const latestMsg = messages[0];
        console.log(`Latest message: "${latestMsg.title || '<no title>'}" by ${latestMsg.author || 'unknown'}`);
    });
}

// ---- rssCloud subscription ----

function subscribeToCloud(cloud: CloudInfo): Promise<void> {
    return new Promise((resolve, reject) => {
        const scheme = parseInt(cloud.port) === 443 ? 'https' : 'http';
        const subscribeUrl = `${scheme}://${cloud.domain}${cloud.path}`;

        console.log(`\nSubscribing to rssCloud hub at ${subscribeUrl}`);
        console.log(`Callback: https://${callbackDomain}${callbackPath}`);

        const postData = new URLSearchParams({
            domain: callbackDomain,
            port: '443',
            path: callbackPath,
            url: urlFeed,
            protocol: 'http-post',
        }).toString();

        const urlObj = new URL(subscribeUrl);
        const options: https.RequestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const transport = urlObj.protocol === 'https:' ? https : http;
        const req = transport.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`rssCloud subscribe response (${res.statusCode}): ${body.trim()}`);
                    resolve();
                } else {
                    console.error(`rssCloud subscribe failed (${res.statusCode}): ${body.trim()}`);
                    reject(new Error(`Subscribe failed with status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('rssCloud subscribe error:', err.message);
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

// ---- Express server for rssCloud callbacks ----

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check
app.get('/', (_req, res) => {
    res.send('RSS Group Chat Client is running');
});

// rssCloud challenge verification (GET)
// The hub sends a GET with ?url=...&challenge=... to verify we own this endpoint
app.get(callbackPath, (req, res) => {
    const challenge = req.query.challenge as string;
    const url = req.query.url as string;

    if (challenge) {
        console.log(`\nReceived rssCloud challenge for ${url}`);
        console.log(`Responding with challenge: ${challenge}`);
        res.type('text/plain').send(challenge);
    } else {
        res.status(400).send('Missing challenge parameter');
    }
});

// rssCloud notification callback (POST)
// The hub POSTs url=<feedUrl> when the feed has changed
app.post(callbackPath, async (req, res) => {
    const feedUrl = req.body.url;
    console.log(`\n--- rssCloud notification received at ${new Date().toISOString()} ---`);
    console.log(`Feed updated: ${feedUrl}`);

    // Respond immediately so the hub doesn't time out
    res.type('text/xml').send('<notifyResult success="true" msg="Thanks for the update."/>');

    // Re-read the feed to get new messages
    try {
        const { groups } = await parseGroupChatFeed();
        printGroupSummary(groups);
        console.log('--- end notification ---\n');
    } catch (err: any) {
        console.error('Error re-reading feed after notification:', err.message);
    }
});

// ---- MetaWeblog posting ----

function sendMessage(title: string, groupId: string) {
    const params = [
        1,    // blogid
        "",   // username
        "",   // password
        {
            "title": title,
            "categories": [groupId]
        },
        true  // publish
    ];

    console.log(`\nSending message to group ${groupId}: "${title}"`);

    client(urlFeed, "metaWeblog.newPost", params, "xml", function (err: any, data: any) {
        if (err) {
            console.error("Send error:", err.message);
        } else {
            console.log("Message sent:", JSON.stringify(data));
        }
    });
}

// ---- Main ----

async function main() {
    // Start the HTTP server first so challenge verification works
    app.listen(port, () => {
        console.log(`RSS Group Chat Client listening on port ${port}`);
        console.log(`Callback endpoint: https://${callbackDomain}${callbackPath}`);
    });

    // Read the feed and discover groups + cloud info
    try {
        const { groups, cloud } = await parseGroupChatFeed();
        printGroupSummary(groups);

        // Subscribe to rssCloud if the feed has a <cloud> element
        if (cloud && cloud.domain) {
            try {
                await subscribeToCloud(cloud);
                console.log('\nrssCloud subscription active. Waiting for notifications...\n');

                // Re-subscribe periodically (subscriptions expire after ~25 hours)
                setInterval(async () => {
                    console.log('Re-subscribing to rssCloud hub...');
                    try {
                        // Re-read feed in case cloud info changed
                        const fresh = await parseGroupChatFeed();
                        if (fresh.cloud && fresh.cloud.domain) {
                            await subscribeToCloud(fresh.cloud);
                            console.log('Re-subscription successful');
                        }
                    } catch (err: any) {
                        console.error('Re-subscription failed:', err.message);
                    }
                }, resubscribeIntervalMs);
            } catch (err: any) {
                console.error('Initial rssCloud subscription failed:', err.message);
                console.log('Server is still running - notifications will not be received until subscription succeeds.');
            }
        } else {
            console.log('\nNo <cloud> element found in feed. rssCloud notifications not available.');
            console.log('The server is still running for manual use.\n');
        }
    } catch (err: any) {
        console.error('Failed to read feed on startup:', err.message);
        console.log('Server is still running. Fix the feed URL and restart.\n');
    }
}

main();

// ---- Example: uncomment to send a message on startup ----
// sendMessage("Hello from the RSS Group Chat Client!", "group123");
