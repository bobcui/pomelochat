var pomelo = require('pomelo')
var config = require('./app/util/config')
var blacklist = require('./app/util/blacklist')
var invalidPackageHandler = require('./app/util/invalidPackageHandler')
var handlerLogFilter = require('./app/filters/handlerLogFilter')
var tokenService = require('./app/modules/token')
var channelService = require('./app/modules/channel')
var channelRemoteProxyService = require('./app/modules/channelRemoteProxy')
var frontChannelService = require('./app/modules/frontChannel')
var userService = require('./app/modules/user')
var leastConnDispatcher = require('./app/dispatchers/leastConnDispatcher')

var app = pomelo.createApp()
app.set('name', 'pomelochat')

config.init(app.get('env'), {path: './config/config.json'})
blacklist.init(app.get('env'), app.getServerType(), {path: './config/blacklist.json'})

var sshParams = config.get('ssh.params')

app.configure(function(){
    app.set('proxyConfig', {
        timeout: 300000,
        bufferMsg: true,
        interval: 50
    })
    app.set('remoteConfig', {
        bufferMsg: true,
        interval: 50,
        handleEnqueue: false,        
        handleInterval: 30,
        handleCountOnce: 300,
        msgMaxPriority: 5
    })
    app.set('serverConfig', {
        handleEnqueue: false,        
        handleInterval: 30,
        handleCountOnce: 300
    })
    app.rpcFilter(pomelo.rpcFilters.rpcLog())
    app.set('ssh_config_params', sshParams)
})

app.configure('all', 'connector', function(){    
    app.set('connectorConfig', {
        connector : pomelo.connectors.hybridconnector,
        distinctHost: true,
        firstTimeout: 3,
        heartbeat : 30,
        disconnectOnTimeout: true,
        blacklistFun: blacklist.get,
        invalidPackageHandler: invalidPackageHandler
    })
    app.set('sessionConfig', {
        bindTimeout: 5
    })
    app.set('frontChannel', frontChannelService)

    app.filter(handlerLogFilter(app, 'connector'))
    app.event.on(pomelo.events.REMOVE_SERVERS, function(ids, items){
        for (var id in items) {
            if (items[id].serverType === 'channel') {
                frontChannelService.clear()
                app.components.__session__.kickAll()
            }
        }
    })
})

app.configure('all', 'gate', function(){
    app.set('connectorConfig', {
        connector : pomelo.connectors.hybridconnector,
        distinctHost: true,
        firstTimeout: 3,
        disconnectOnTimeout: true,
        blacklistFun: blacklist.get,
        invalidPackageHandler: invalidPackageHandler   
    })
    app.set('sessionConfig', {
        bindTimeout: 5
    })
    leastConnDispatcher.init(app)
    app.filter(handlerLogFilter(app, 'gate'))    
})

app.configure('all', 'api', function(){
    app.set('connectorConfig', {
        connector : pomelo.connectors.httpconnector,
        distinctHost: true,
        blacklistFun: blacklist.get
    })
    app.filter(handlerLogFilter(app, 'api'))
})

app.configure('all', 'auth', function(){
    app.set('token', tokenService)
    tokenService.init()
    app.filter(handlerLogFilter(app, 'auth'))
})

app.configure('all', 'channel', function(){
    app.set('user', userService)
    app.set('channel', channelService)
    channelService.init()
    app.filter(handlerLogFilter(app, 'channel'))
    app.event.on(pomelo.events.REMOVE_SERVERS, function(ids, items){
        for (var id in items) {
            if (items[id].serverType === 'connector') {
                channelRemoteProxyService.leaveServer(id)
            }
        }
    })
})

app.start()

process.on('uncaughtException', function(err) {
    console.error(' Caught exception: ' + err.stack)
})
