module.exports = {

    SUCC                                : 0,
    INVALID_PARAMETER                   : 1,
    INTERNAL_SERVER_ERROR               : 50,

    AUTH: {
        TOKEN_INVALID                   : 1001
    },

    CONNECTOR: {
        BIND_SESSION_ERROR              : 1101
    },

    ROOM: {
        USER_CHANNEL_MEET_MAX           : 1201,
        CHANNEL_USER_MEET_MAX           : 1202,
        CHANNEL_CONNECTION_MEET_MAX     : 1203,
        CHANNEL_USER_CONNECTION_MEET_MAX: 1204,

        USER_NOT_IN_SERVER              : 1205,
        USER_NOT_IN_CHANNEL             : 1206,
        USER_CTX_NOT_FOUND              : 1207
    }
    
};