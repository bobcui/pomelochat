var _ = require('underscore')
var logger = require('pomelo-logger').getLogger('channel', __filename, 'pid:'+process.pid)
var channelService = require('../../../modules/channel')
var userService = require('../../../modules/user')
var Code = require('../../../util/code')
var utils = require('../../../util/utils')
var channelRemoteProxy = require('../../../modules/channelRemoteProxy')

module.exports = function(app) {
	return new Remote(app)
}

var Remote = function(app) {
	this.app = app
}

var remote = Remote.prototype

remote.enter = function(userId, channelId, userRole, userData, context, cb) {
    channelRemoteProxy.enter(userId, channelId, userRole, userData, context, cb)
}

remote.leave = function(userId, channelId, context, cb) {
    channelRemoteProxy.leave(userId, channelId, context, cb)
}

remote.leaveBatch = function(users, cb) {
    var self = this
    var failed = []
    var checker = function(err, code) {        
        if (!err && code !== Code.SUCC) {
            failed.push({user:user, code:code})
        }
    }

    for (var i=0; i<users.length; ++i) {
        var user = users[i]
        self.leave(user.userId, user.channelId, user.context, checker)
    }

    if (failed.length > 0) {
        logger.warn('leaveBatch has fail users.length=%s failed.length=%s failed=%j', users.length, failed.length, failed)    
    }
    else {
        logger.info('leaveBatch succ users.length=%s failed.length=%s', users.length, failed.length)
    }

    cb(null, Code.SUCC, failed)
}

remote.kickUser = function(userId, channelId, cb) {
    var user = userService.getUser(userId)
    if (!user) {
        logger.warn('kickUser fail userId=%s channelId=%s code=%s', userId, channelId, Code.USER_NOT_EXIST)
        cb(null, Code.USER_NOT_EXIST)
        return
    }

    var outData = {}
    if (!!channelId) {
        var channelIds
        if (_.isArray(channelId)) {
            channelIds = channelId
        }
        else {
            channelIds = [channelId]
        }

        _.each(channelIds, function(cId) {
            var ctx = {}
            if (user.leave(cId, null, ctx) === Code.SUCC) {
                outData[cId] = {}
                outData[cId][ctx.roomId] = ctx.contexts
            }
        })
    }
    else {
        var out = {}
        user.leaveAll(out)
        _.each(out, function(ctx, cId){
            outData[cId] = {}
            outData[cId][ctx.roomId] = ctx.contexts
        })
    }

    _.each(outData, function(data, cId){
        var channel = channelService.getChannel(cId)
        if (!!channel && channel.getUserCount() === 0) {
            channelService.destroyChannel(cId)
        }
    })

    if (user.getChannelCount() === 0) {
        userService.destroyUser(userId)
    }

    logger.info('kickUser succ userId=%s channelId=%s code=%s', userId, channelId, Code.SUCC)
    cb(null, Code.SUCC, outData)
}

remote.kickIp = function(ip, cb) {
    var outData = {}
    var innerIpData = {}    
    var ipData = userService.getIps()[ip]
    if (!!ipData) {
        _.each(ipData.users, function(datas, userId){
            if (!innerIpData[userId]) {
                innerIpData[userId] = []
            }
            _.each(datas, function(data){
                innerIpData[userId].push(data)
            })
        })

        _.each(innerIpData, function(datas, userId){
            var user = userService.getUser(userId)
            if (!!user) {
                _.each(datas, function(data){
                    var out = {}
                    user.leave(data.channelId, data.context, out)
                    if (!outData[data.channelId]) {
                        outData[data.channelId] = {}
                    }
                    if (!outData[data.channelId][out.roomId]) {
                        outData[data.channelId][out.roomId] = []
                    }
                    outData[data.channelId][out.roomId].push(data.context)

                    var channel = channelService.getChannel(data.channelId)
                    if (!!channel && channel.getUserCount() === 0) {
                        channelService.destroyChannel(data.channelId)
                    }
                })

                if (user.getChannelCount() === 0) {
                    userService.destroyUser(userId)
                }
            }
        })
    }

    logger.info('kickIp succ ip=%s data=%j code=%s', ip, innerIpData, Code.SUCC)
    cb(null, Code.SUCC, outData)
}

remote.getRoomIdByUserId = function(channelId, userId, cb) {
    var user = userService.getUser(userId)
    if (!user) {
        cb(null, Code.USER_NOT_EXIST)
        return
    }

    var userChannel = user.getChannelData(channelId)
    if (!userChannel) {
        cb(null, Code.USER_NOT_IN_CHANNEL)
        return        
    }

    cb(null, Code.SUCC, userChannel.roomId)
}

/**************************************************
    log msg count
***************************************************/
remote.logMsgCount = function(min, channelId, roomIds, msgCount, cb) {
    var channel = channelService.getChannel(channelId)
    if (!!channel) {
        if (!min) {
            min = Date.now() / 60000 | 0
        }
        _.each(roomIds, function(roomId){
            var room = channel.getRoom(roomId)
            if (!room) {
                logger.error('statRoomMsg room not found channel=%s room=%s', channelId, roomId)
            }
            else {
                room.logMsgCount(min, msgCount)
            }
        })

        channelService.logMsgCount(min, msgCount)
    }
    utils.invokeCallback(cb)
}

remote.logMsgCountBatch = function(min, channels, cb) {
    if (!min) {
        min = Date.now() / 60000 | 0
    }

    var self = this
    _.each(channels, function(channel, channelId){
        _.each(channel, function(msgCount, roomId){
            self.logMsgCount(min, channelId, [roomId], msgCount)
        })
    })

    utils.invokeCallback(cb)
}


/**************************************************
    get user count
***************************************************/
remote.getServerUserCount = function(cb) {
    cb(null, Code.SUCC, userService.getUserCount(), channelService.getConnectionCount())
}

remote.getChannelUserCount = function(channelIds, cb) {
    if (!_.isArray(channelIds)) {
        channelIds = [channelIds]
    }

    var counts = {}
    for (var i=0; i<channelIds.length; ++i) {
        var channelId = channelIds[i]
        var channel = channelService.getChannel(channelId)
        if (!channel) {
            counts[channelId] = null
        }
        else {
            counts[channelId] = {
                userCount: channel.getUserCount(),
                connectionCount: channel.getConnectionCount()   
            }
        }
    }
    cb(null, Code.SUCC, counts)
}

remote.getAllChannelUserCount = function(cb) {
    var channelIds = _.keys(channelService.getChannels())
    this.getChannelUserCount(channelIds, cb)
}

remote.getRoomUserCount = function(channelId, roomIds, cb) {
    if (!_.isArray(roomIds)) {
        roomIds = [roomIds]
    }

    var channel = channelService.getChannel(channelId)
    if (!channel) {
        cb(null, Code.CHANNEL_NOT_EXIST)
        return
    }

    var counts = {}
    for (var i=0; i<roomIds.length; ++i) {
        var roomId = roomIds[i]
        var room = channel.getRoom(roomId)
        if (!room) {
            counts[roomId] = null
        }
        else {
            counts[roomId] = {
                userCount: room.getUserCount(),
                connectionCount: room.getConnectionCount()
            }
        }
    }

    cb(null, Code.SUCC, counts)
}

remote.getRoomUserCountByUserId = function(channelId, userId, cb) {
    var user = userService.getUser(userId)
    if (!user) {
        cb(null, Code.USER_NOT_EXIST)
        return
    }

    var userChannel = user.getChannelData(channelId)
    if (!userChannel) {
        cb(null, Code.USER_NOT_IN_CHANNEL)
        return        
    }

    this.getRoomUserCount(channelId, userChannel.roomId, function(err, code, counts){
        if (!!err || code !== Code.SUCC) {
            cb(err, code)
        }
        else {
            if (counts[userChannel.roomId] === null) {
                logger.fatal('user %s not in channel %s room %s, but should be in', userId, channelId, userChannel.roomId)
                cb(err, Code.INTERNAL_SERVER_ERROR)
            }
            else {
                cb(null, Code.SUCC, counts[userChannel.roomId].userCount, counts[userChannel.roomId].connectionCount)
            }
        }
    })
}


/**************************************************
    get user list
***************************************************/
remote.getChannelUsers = function(channelIds, dataKeys, cb) {
    if (!_.isArray(channelIds)) {
        channelIds = [channelIds]
    }

    var users = {}
    _.each(channelIds, function(channelId){
        var channel = channelService.getChannel(channelId)
        if (!channel) {
            users[channelId] = null
        }
        else {
            users[channelId] = channel.getUsers(dataKeys)
        }
    })

    cb(null, Code.SUCC, users)
}

remote.getRoomUsers = function(channelId, roomIds, dataKeys, cb) {
    if (!_.isArray(roomIds)) {
        roomIds = [roomIds]
    }

    var channel = channelService.getChannel(channelId)
    if (!channel) {
        cb(null, Code.CHANNEL_NOT_EXIST)
        return
    }

    var users = {}
    _.each(roomIds, function(roomId){
        var room = channel.getRoom(roomId)
        if (!room) {
            users[roomId] = null
        }
        else {
            users[roomId] = room.getUsers(dataKeys)
        }
    })

    cb(null, Code.SUCC, users)
}

remote.getRoomUsersByUserId = function(channelId, userId, dataKeys, cb) {
    var user = userService.getUser(userId)
    if (!user) {
        cb(null, Code.USER_NOT_EXIST)
        return
    }

    var userChannel = user.getChannelData(channelId)
    if (!userChannel) {
        cb(null, Code.USER_NOT_IN_CHANNEL)
        return        
    }

    this.getRoomUsers(channelId, userChannel.roomId, dataKeys, function(err, code, users){
        if (!!err || code !== Code.SUCC) {
            cb(err, code)
        }
        else {
            if (users[userChannel.roomId] === null) {
                logger.fatal('user %s not in channel %s room %s, but should be in', userId, channelId, userChannel.roomId)
                cb(err, Code.INTERNAL_SERVER_ERROR)
            }
            else {
                cb(null, Code.SUCC, users[userChannel.roomId])
            }
        }
    })
}

/**************************************************
    dump
***************************************************/
remote.dumpUser = function(userIds, cb) {
    if (!_.isArray(userIds)) {
        userIds = [userIds]
    }

    var users = {}
    _.each(userIds, function(userId){
        var user = userService.getUser(userId)
        if (!user) {
            users[userId] = null
        }
        else {
            users[userId] = user.dump()
        }
    })

    cb(null, Code.SUCC, users)
}

remote.dumpAllUser = function(cb) {
    cb(null, Code.SUCC, userService.dump())
}

remote.dumpChannel = function(channelIds, cb) {
    if (!_.isArray(channelIds)) {
        channelIds = [channelIds]
    }

    var channels = {}
    _.each(channelIds, function(channelId){
        var channel = channelService.getChannel(channelId)
        if (!channel) {
            channels[channelId] = null
        }
        else {
            channels[channelId] = channel.dump()
        }
    })

    cb(null, Code.SUCC, channels)       
}

remote.dumpAllChannel = function(cb) {
    cb(null, Code.SUCC, channelService.dump())
}

/**************************************************
    top & sort
***************************************************/
remote.topChannels = function(topNum, cb) {
    cb(null, Code.SUCC, channelService.topChannels(topNum))
}

remote.topIps = function(topNum, cb) {
    cb(null, Code.SUCC, userService.topIps(topNum))
}

remote.sortIps = function(minCount, cb) {
    cb(null, Code.SUCC, userService.sortIps(minCount))
}

/**************************************************
    stats
***************************************************/
remote.getServerStats = function(cb) {
    cb(null, Code.SUCC, {
        stats: channelService.getStats(),
        userCount: userService.getUserCount(), 
        connectionCount: channelService.getConnectionCount(),
        channelCount: _.keys(channelService.getChannels()).length
    })
}