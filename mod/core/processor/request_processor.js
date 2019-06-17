/**
 * @author Pedro Sanders
 * @since v1
 */
const ProcessorUtils = require('@routr/core/processor/utils')
const RegisterHandler = require( '@routr/core/processor/register_handler')
const CancelHandler = require('@routr/core/processor/cancel_handler')
const RequestHandler = require('@routr/core/processor/request_handler')
const RouteInfo = require('@routr/core/processor/route_info')
const getConfig = require('@routr/core/config_util')
const AclUtil = require('@routr/core/acl/acl_util')
const { RoutingType } = require('@routr/core/routing_type')
const { Status } = require('@routr/core/status')

const SipFactory = Java.type('javax.sip.SipFactory')
const Request = Java.type('javax.sip.message.Request')
const Response = Java.type('javax.sip.message.Response')

class RequestProcessor {

    constructor(sipProvider, dataAPIs, contextStorage) {
        this.sipProvider = sipProvider
        this.contextStorage = contextStorage
        this.dataAPIs = dataAPIs
        this.domainsAPI = dataAPIs.DomainsAPI
        this.messageFactory = SipFactory.getInstance().createMessageFactory()
        this.config = getConfig()
    }

    process(event) {
        const request = event.getRequest()
        let serverTransaction = event.getServerTransaction()

        if (serverTransaction === null && request.getMethod().equals(Request.ACK) === false) {
            serverTransaction = this.sipProvider.getNewServerTransaction(request)
        }

        const procUtils = new ProcessorUtils(request, serverTransaction, this.messageFactory)

        if (this.allowedAccess(event) === false) {
            return procUtils.sendResponse(Response.FORBIDDEN)
        }

        switch (request.getMethod()) {
            case Request.REGISTER:
              new RegisterHandler(this.dataAPIs).doProcess(serverTransaction)
              break
            case Request.CANCEL:
              new CancelHandler().doProcess(serverTransaction)
              break
            default:
              new RequestHandler(this.sipProvider, this.dataAPIs, this.contextStorage)
                .doProcess(serverTransaction)
        }
    }

    allowedAccess(event) {
        const request = event.getRequest()
        const remoteIp = event.getRemoteIpAddress()
        const routeInfo = new RouteInfo(request, this.dataAPIs)
        const acl = this.config.spec.accessControlList

        if(acl) {
            if(new AclUtil(acl).isIpAllowed(remoteIp) === false) {
                return false
            }
        }

        const addressOfRecord = ProcessorUtils.getAOR(request)

        if (routeInfo.getRoutingType().equals(RoutingType.INTRA_DOMAIN_ROUTING)) {
            const response = this.domainsAPI.getDomainByUri(addressOfRecord.getHost())
            if (response.status === Status.OK) {
                const acl = response.result.spec.context.accessControlList
                if(acl && new AclUtil(acl).isIpAllowed(remoteIp) === false) {
                    return false
                }
            }
        }
        return true
    }

}

module.exports = RequestProcessor
