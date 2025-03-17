import { readFeed } from './reallysimple.js'
import { client } from 'davexmlrpc'

const urlFeed = "http://127.0.0.1:3000/feed?key=userkey"

interface GroupChatGroup {
    url: string;
    title: string;
    id: string;
}

interface FeedItem {
    title?: string;  // Some items might not have titles
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

// Parse feed and group messages
function parseGroupChatFeed(): Promise<GroupedMessages> {
    return new Promise((resolve, reject) => {
        readFeed(urlFeed, (err: Error | null, feed: any) => {
            if (err) {
                console.error('Error:', err.message);
                reject(err);
                return;
            }

            const groupedMessages: GroupedMessages = {};
            
            feed.items.forEach((item: FeedItem) => {
                const group = item['groupchat:group'];
                if (group && group.id) {  // Make sure we have a valid group with an ID
                    if (!groupedMessages[group.id]) {
                        groupedMessages[group.id] = {
                            group,
                            messages: []
                        };
                    }
                    groupedMessages[group.id].messages.push(item);
                }
            });

            // Print summary of groups
            console.log('\nGroups found:');
            Object.values(groupedMessages).forEach(({ group, messages }) => {
                console.log(`\nGroup: ${group.title}`);
                console.log(`ID: ${group.id}`);
                console.log(`Message count: ${messages.length}`);
                const latestMsg = messages[0];
                console.log(`Latest message: "${latestMsg.title || '<no title>'}" by ${latestMsg.author || 'unknown'}`);
            });

            resolve(groupedMessages);
        });
    });
}




// Run the parser
parseGroupChatFeed().catch(err => {
     console.error('Failed to parse feed:', err);
});




// Make a new post to the MetaWeblog API

const params = [
1, //blogid
"", //username
"", //password
{
    "title": "This is a test of the MetaWeblog API.",
    "categories": ["group123"]
    },
true //publish
];
client (urlFeed, "metaWeblog.newPost", params, "xml", function (err, data) {
if (err) {
    console.log ("err.message == " + err.message);
    }
else {
    console.log (JSON.stringify(data));
    }
});



