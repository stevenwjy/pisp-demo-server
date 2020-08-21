/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the 'License') and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Mojaloop Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Google
 - Steven Wijaya <stevenwjy@google.com>
 --------------
 ******/

import { Server } from '@hapi/hapi'
import * as faker from 'faker'

import config from '~/lib/config'

import { Simulator } from '~/shared/ml-thirdparty-simulator'
import {
  PartyIdType,
  Currency,
  AmountType,
  AuthenticationType,
  AuthenticationResponseType,
} from '~/shared/ml-thirdparty-client/models/core'

import {
  ThirdPartyTransactionRequest,
  AuthorizationsPutIdRequest,
} from '~/shared/ml-thirdparty-client/models/openapi'

import { PartyFactory } from '~/shared/ml-thirdparty-simulator/factories/party'
import { AuthorizationFactory } from '~/shared/ml-thirdparty-simulator/factories/authorization'
import { TransferFactory } from '~/shared/ml-thirdparty-simulator/factories/transfer'

jest.useFakeTimers()

/**
 * Mock data for party lookup.
 */
const partyLookupParams = {
  type: PartyIdType.MSISDN,
  id: '+1-111-111-1111'
}

/**
 * Mock data for transaction request.
 */
const transactionRequestData = {
  transactionRequestId: '222',
  sourceAccountId: '123',
  consentId: '333',
  amountType: AmountType.RECEIVE,
  amount: {
    amount: '20',
    currency: Currency.USD,
  },
  transactionType: {
    scenario: 'TRANSFER',
    initiator: 'PAYER',
    initiatorType: 'CONSUMER',
  },
  expiration: '12345'
}

// Mock firebase to prevent server from listening to the changes.
jest.mock('~/lib/firebase')

// Mock the factories to consistently return the hardcoded values.
jest.mock('~/shared/ml-thirdparty-simulator/factories/participant')
jest.mock('~/shared/ml-thirdparty-simulator/factories/party')
jest.mock('~/shared/ml-thirdparty-simulator/factories/authorization')
jest.mock('~/shared/ml-thirdparty-simulator/factories/transfer')

describe('Mojaloop third-party simulator', () => {
  let simulator: Simulator
  let server: Server

  beforeAll(async () => {
    server = {
      inject: jest.fn().mockImplementation()
    } as unknown as Server

    simulator = new Simulator(server, {
      host: 'mojaloop.' + config.get('hostname'),
      delay: 100,
    })
  })

  beforeEach(() => {
    jest.clearAllTimers()
    jest.clearAllMocks()
  })

  it('Should inject server with the result of party lookup', async () => {
    const targetUrl = '/parties/' + partyLookupParams.type + '/' + partyLookupParams.id

    // this is a workaround to handle the delay before injecting response to the server
    Promise.resolve().then(() => jest.advanceTimersByTime(100))
    await simulator.getParties(partyLookupParams.type, partyLookupParams.id)

    // payload that is injected to the server must match the one generated by the simulator
    const payload = PartyFactory.createPutPartiesRequest(partyLookupParams.type, partyLookupParams.id)

    expect(server.inject).toBeCalledTimes(1)
    expect(server.inject).toBeCalledWith({
      method: 'PUT',
      url: targetUrl,
      headers: {
        host: 'mojaloop.' + config.get('hostname'),
        'Content-Length': JSON.stringify(payload).length.toString(),
        'Content-Type': 'application/json',
      },
      payload,
    })
  })

  it('Should inject server with the authorization prompt', async () => {
    const targetUrl = '/authorizations'
    const payerInfo = PartyFactory.createPutPartiesRequest(PartyIdType.MSISDN, '+1-222-222-2222')
    const payeeInfo = PartyFactory.createPutPartiesRequest(PartyIdType.MSISDN, '+1-111-111-1111')
    const request: ThirdPartyTransactionRequest = {
      payer: payerInfo.party,
      payee: payeeInfo.party,
      ...transactionRequestData,
    }

    // this is a workaround to handle the delay before injecting response to the server
    Promise.resolve().then(() => jest.advanceTimersByTime(100))
    await simulator.postTransactions(request)

    const payload = AuthorizationFactory.createPostAuthorizationsRequest(request)

    expect(server.inject).toBeCalledTimes(1)
    expect(server.inject).toBeCalledWith({
      method: 'POST',
      url: targetUrl,
      headers: {
        host: 'mojaloop.' + config.get('hostname'),
        'Content-Length': JSON.stringify(payload).length.toString(),
        'Content-Type': 'application/json',
      },
      payload,
    })
  })

  it('Should inject server with the transfer result', async () => {
    const transactionRequestId = '111'
    const transactionId = '222'
    const transferId = '78910'

    const randomUuidSpy = jest.spyOn(faker.random, 'uuid').mockImplementation(() => transferId)
    const targetUrl = '/transfers/' + transferId

    const request: AuthorizationsPutIdRequest = {
      authenticationInfo: {
        authentication: AuthenticationType.U2F,
        authenticationValue: 'abcdefg',
      },
      responseType: AuthenticationResponseType.ENTERED,
    }

    // this is a workaround to handle the delay before injecting response to the server
    Promise.resolve().then(() => jest.advanceTimersByTime(100))
    await simulator.putAuthorizations(transactionRequestId, request, transactionId)

    const payload = TransferFactory.createTransferIdPutRequest(
      transactionRequestId, request, transactionId)

    expect(randomUuidSpy).toHaveBeenCalledTimes(1)
    expect(server.inject).toHaveBeenCalledTimes(1)
    expect(server.inject).toHaveBeenCalledWith({
      method: 'PUT',
      url: targetUrl,
      headers: {
        host: 'mojaloop.' + config.get('hostname'),
        'Content-Length': JSON.stringify(payload).length.toString(),
        'Content-Type': 'application/json',
      },
      payload,
    })
  })
})
