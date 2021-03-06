var builder = require('botbuilder');
var ctrl = require('./src/internal/ctrl')
var restify = require('restify');
var settings = require('./src/resources/settings.json');
var text = require("./src/resources/text.json");
var utils = require('./src/internal/utils')

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector, { persistConversationData: true });
server.post('/api/messages', connector.listen());

bot.beginDialogAction('hi', '/', { matches: /^\bhi\b|\bhello\b|\bhey\b|\bhallo\b/i });
bot.beginDialogAction('about', '/greeting', { matches: /^about|help/i });
bot.beginDialogAction('search', '/search', { matches: /^search/i });
bot.beginDialogAction('inspire', '/inspire', { matches: /^inspire/i, promptAfterAction: false });
bot.beginDialogAction('reset', '/reset', { matches: /^reset/i });
bot.beginDialogAction('bye', '/goodbye', { matches: /^bye\b/i });
bot.beginDialogAction('test', '/test', { matches: /^test/i });

bot.dialog('/test', function (session) {
    if (settings.DEBUG) {
        session.send("user: " + JSON.stringify(session.message.user));
        session.send("agent: " + JSON.stringify(session.message.agent));
        session.send("source: " + JSON.stringify(session.message.source));
    }
    session.endDialog();
});

bot.dialog('/', function(session) {
    let msg;
    if (session.userData.firstRun === undefined) {
        msg = utils.getText(text.greeting.first, session);
    } else {
        msg = utils.getText(text.greeting.back, session);
    }
    session.send(msg);
    session.sendTyping();
    session.conversationData.lastVisited = session.lastSendTime;
    session.userData.firstRun = true;
    session.beginDialog('/start');
});

bot.dialog('/greeting', [
    function(session) {
        const greeting = utils.getText(text.greeting.first, session);
        session.send(greeting);
        session.sendTyping();
        session.endDialog();
    }
]);

bot.dialog('/start', [
    function(session) {
        let msg;
        if (session.userData.firstRun !== undefined && session.userData.firstRun) {
            msg = utils.getText(text.start.first);
            session.userData.firstRun = false;
        } else {
            msg = utils.getText(text.start.back);
        }
        utils.sendQuickRepliesMessage(session, msg, text.start.replies);
    },
    function(session, results) {
        if (utils.textContains(results.response, text.syn.search, 1)) {
            session.beginDialog('/search');
        } else if (utils.textContains(results.response, text.syn.inspire, 2)) {
            session.beginDialog('/inspire')
        } else {
            utils.dialogRetry(session, text.start.replies, '/start');
        }        
    }
]);

bot.dialog('/search', [
    function(session) {
        session.conversationData.inspire = false;
        builder.Prompts.text(session, utils.getText(text.search.topic));
    },
    function(session, results) {
        session.conversationData.newTerm = results.response.trim().toLowerCase();
        ctrl.processSearchRequest(session, function() {
            session.beginDialog('/continue');
        });
    }
]);

bot.dialog('/inspire', [
    function(session) {
        session.conversationData.inspire = true;
        session.conversationData.newTerm = null;
        ctrl.processSearchRequest(session, function() {
            session.beginDialog('/continue');
        });        
    }
]);

bot.dialog('/continue', [
    function(session) {
        if (session.conversationData.found) {
            let msg;
            if (session.conversationData.inspire) {
                msg = utils.getText(text.continue.inspire);
            } else {
                msg = utils.getText(text.continue.search);
            }
            utils.sendQuickRepliesMessage(session, msg, text.continue.replies);
        } else {
            session.beginDialog('/restart');
        }
    },
    function(session, results) {
        if (utils.textContains(results.response, text.syn.yes, 1)) {
            ctrl.processSearchRequest(session, function() {
                session.replaceDialog('/continue', { reprompt: true });
            });            
        } else if (utils.textContains(results.response, text.syn.no, 2)) {
            session.beginDialog('/restart');
        } else if (utils.textContains(results.response, text.syn.search, 3)) {
            session.beginDialog('/search');
        } else {
            utils.dialogRetry(session, text.continue.replies, '/continue');
        }
    }
]);

bot.dialog('/restart', [
    function(session) {
        const msg = utils.getText(text.restart.ask);
        utils.sendQuickRepliesMessage(session, msg, text.restart.replies);
    },
    function(session, results) {
        if (utils.textContains(results.response, text.syn.search, 1)) {
            session.beginDialog('/search');
        } else if (utils.textContains(results.response, text.syn.inspire, 2)) {
            session.beginDialog('/inspire');
        } else if (utils.textContains(results.response, text.syn.no, 3)) {
            session.beginDialog('/goodbye');
        } else {
            utils.dialogRetry(session, text.restart.replies, '/restart');
        }
    }
]);

bot.dialog('/goodbye', [
    function(session) {
        session.send(utils.getText(text.end));
        session.endConversation();
    }
]);

//TODO https://docs.botframework.com/en-us/core-concepts/userdata#deletinguserdata
bot.dialog('/reset', [
    function(session) {
        session.userData = {};
        session.conversationData = {};
        session.beginDialog("/");
    }
]);

bot.use({
    botbuilder: function (session, callback) {
            session.sendTyping();
        ctrl.processUser(session, callback);
    }
});