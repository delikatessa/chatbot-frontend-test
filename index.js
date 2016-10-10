var builder = require('botbuilder');
var restify = require('restify');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
    appId: '6efc2601-344a-4e6b-a942-6a4bc8475e74',//process.env.MICROSOFT_APP_ID,
    appPassword: 'kxBVpkV8yOCnddhf1ctv5iZ'//process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector, { persistConversationData: true });
server.post('/api/messages', connector.listen());

bot.dialog('/', function (session) {
    session.send("Hi **" + session.message.user.name + "**, I'm your personal idea scout, designed to help you find inspiring ideas in the form of TED and TEDx talks from all over the world! Just enter a topic you're interested in and I'll give you some fitting suggestions.");
    session.conversationData.lastSendTime = session.lastSendTime;
    session.beginDialog('/search');
});

bot.dialog('/search', [
    function (session) {
        var msg = "How would you like to get started?";
        builder.Prompts.choice(session, msg, ["Search", "Inspire me"], { retryPrompt: GetRetryPrompt(session, msg) });
    },
    function (session, results, next) {
        if (results.response.entity === "Inspire me") {
            session.conversationData.discover = true;
            session.userData.discoverIteration = 1;
            next();
        } else {
            session.conversationData.discover = false;
            session.conversationData.searchIteration = 1;
            builder.Prompts.text(session, "Ok, what are you interested in?");
        }
    },
    function (session, results, next) {
        if (!session.conversationData.discover) {
            session.conversationData.searchTerm = results.response;
        }
        Search(session, function () {
            next();
        });
    },
    function (session) {
        session.beginDialog('/more');
    }
]);

bot.dialog('/more', [
    function (session) {
        if (session.conversationData.found) {
            var msg;
            if (session.conversationData.discover) {
                msg = "Would you like to get more inspiration?";
            } else {
                msg = "Would you like to get more inspiration on this topic?";
            }
            builder.Prompts.choice(session, msg, ["Sure", "I'm good"], { retryPrompt: GetRetryPrompt(session, msg) });
        } else {
            session.beginDialog('/finish');
        }
    },
    function (session, results) {
        if (results.response.entity === "Sure") {
            if (session.conversationData.discover) {
                session.userData.discoverIteration++;
            } else {
                session.conversationData.searchIteration++;
            }
            Search(session, function () {
                session.replaceDialog('/more', { reprompt: true });
            });
        } else {
            session.beginDialog('/finish');
        }
    }
]);

bot.dialog('/finish', [
    function (session) {
        var msg = "Is there anything else you’d like to do?";
        builder.Prompts.choice(session, msg, ["Sure", "I'm good"], { retryPrompt: GetRetryPrompt(session, msg) });
    },
    function (session, results) {
        if (results.response.entity === "Sure") {
            session.beginDialog('/search');
        } else {
            session.send("Thanks for dropping by! Come back anytime for a further dose of inspiration. Talk to you soon!");
            session.endConversation();
        }
    }
]);

function GetRetryPrompt(session, msg) {
    return [
        "Sorry **" + +session.message.user.name + "**, I don't understand gibberish...\n\n" + msg,
        "Your wordsmith skills are just too much for me! I didn't get that.\n\n" + msg,
        "Oh stop it! I'm blushing. Or did I get that wrong?\n\n" + msg,
        "Asfdsjihu. Or did you mean omdjosfjsjn? Please choose one of the following options.\n\n" + msg];
}

var MAX_RESULTS = 3;

function Search(session, next) {
    var youtube = require('youtube-search');
    var iteration;
    var searchTerm;
    if (session.conversationData.discover) {
        searchTerm = '';
        iteration = session.userData.discoverIteration;
    } else {
        searchTerm = session.conversationData.searchTerm;
        iteration = session.conversationData.searchIteration;
    }
    var order;
    var maxResults;
    if (session.conversationData.discover) {
        var orders = ['date', 'rating', 'relevance', 'title', 'videoCount', 'viewCount'];
        order = orders[Random(0, 5)];
        maxResults = Random(MAX_RESULTS, 50);
    } else {
        order = 'relevance';
        maxResults = MAX_RESULTS * iteration;
    }
    //https://developers.google.com/youtube/v3/docs/search/list
    var opts = {
        maxResults: maxResults,
        key: 'AIzaSyA491fhVfZBa5qZPBQx6zjAn1bmc4SRkjY',
        part: 'snippet',
        order: order,
        chart: 'mostPopular',
        channelId: 'UCsT0YIqwnpJCM-mx7-gSA4Q',
        type: 'video',
        relevanceLanguage: 'en'
    };
    youtube(searchTerm, opts, function (err, results) {
        if (err) {
            builder.Prompts.text(session, err);
            return;
        }
        if (results) {
            if (session.conversationData.discover) {
                var results2 = [];
                var idxs = [];
                while (results2.length < MAX_RESULTS) {
                    var idx = Random(1, maxResults) - 1;
                    if (idxs.indexOf(idx) === -1) {
                        results2.push(results[idx]);
                        idxs.push(idx);
                    }
                }
                results = results2;
            } else if (iteration > 1 && results.length > MAX_RESULTS * (iteration - 1)) {
                results = results.slice(MAX_RESULTS * (iteration - 1));
            }
            var attachments = [];
            for (var i = 0, len = results.length; i < len; i++) {
                var result = results[i];
                var card = new builder.ThumbnailCard(session)
                    .title(result.title)
                    .tap(builder.CardAction.openUrl(session, result.link))
                    .buttons([builder.CardAction.openUrl(session, result.link, 'Watch now')])
                    .images([builder.CardImage.create(session, result.thumbnails.high.url)]);
                attachments.push(card);
            }
            if (results.length === 0) {
                session.send("Sorry **" + session.message.user.name + "**, I couldn't find anything.");
            } else {
                session.conversationData.found = true;
                var reply = new builder.Message(session)
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments(attachments);
                session.send(reply);
            }
        }
        next();
    });
}

function Random(low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}

bot.use({
    botbuilder: (session, next) => {
        var last = session.conversationData.lastSendTime;
        var now = Date.now();
        var diff = moment.duration(now - last).asHours();
        if (last == undefined || diff > 1) {
            session.userData = {};
            session.conversationData = {};
            session.beginDialog('/');
        } else {
            session.conversationData.lastSendTime = session.lastSendTime;
            next();
        }
    }
});
