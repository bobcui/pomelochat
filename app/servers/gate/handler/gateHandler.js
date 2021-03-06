var _ = require('underscore')
var Code = require('../../../util/code')
var config = require('../../../util/config')
var logger = require('pomelo-logger').getLogger('gate', __filename, 'pid:'+process.pid)

var dispatchers = {
    'leastConnDispatcher': require('../../../dispatchers/leastConnDispatcher'),
    'randomDispatcher': require('../../../dispatchers/randomDispatcher'),
    'roundRobinDispatcher': require('../../../dispatchers/roundRobinDispatcher')
}

module.exports = function(app) {
    return new Handler(app)
}

var Handler = function(app) {
    this.app = app
}

var handler = Handler.prototype

/*
req = {
    userId: xxx,
    channelId: xxxx
}
res = {
    code:
    host:
    port:
}
*/
handler.lookupConnector = function(req, session, next) {
    if (!session.isValid()) {
        next(null, {
            code: Code.BAD_REQUEST
        })
        return
    }

    if (_.isUndefined(req.userId) || _.isUndefined(req.channelId)) {
        next(null, {
            code: Code.BAD_REQUEST
        })
        session.closed('bad request')
        return
    }

    var connectors = this.app.getServersByType('connector')
    if(!connectors || connectors.length === 0) {
        next(null, {
            code: Code.INTERNAL_SERVER_ERROR
        })
        session.closed('internal server error')
        return
    }

    var dispatcherName = config.get('gate.dispatcher')
    if (!dispatcherName || !dispatchers[dispatcherName]) {
        dispatcherName = 'leastConnDispatcher'
    }

    var connector = dispatchers[dispatcherName].dispatch(connectors)
    next(null, {
        code: Code.SUCC,
        host: connector.clientHostReal,
        port: connector.clientPort
    })             
    session.closed('succ')

    logger.debug('gate dispatch userId=%s channelId=%s to %s %s:%s', req.userId, req.channelId, connector.id, connector.clientHostReal, connector.clientPort)
}
