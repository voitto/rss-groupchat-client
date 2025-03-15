# reallysimple-groupchat-client
Example group chat client app with the RSS GroupChat Extension  https://rss.ag/rss-groupchat-extension/

# files

- reallysimple-groupchat.diff -- this is a diff of the reallysimple.js that shows the changes to support groupchat:group elements
- reallysimple.js -- a copy of the reallysimple library with the modifications
- index.ts -- example client app for the RSS GroupChat Extension

# how-to

## setup:

run the "npm install" command

## aggregate a feed with groupchat data:

1) edit the index.ts file and paste a feed URL into the urlFeed variable on line 4
2) run the "npm run dev" command

## send a post to the MetaWebLog API:

1) edit the index.ts file and paste the id of a group into the "categories" variable on line 90
2) run the "npm run dev" command

