import { checkIsBinRange, dateInSeconds, isDate } from '../../dates'

import AWS from 'aws-sdk'
import { Cursor } from '../../cursor'
import fetch from 'node-fetch'
import { fillTimeSliceCommandQueueSchema } from '../../validators'
import { sleep } from '../../timers'

const sqs = new AWS.SQS()

//https://thegraph.com/hosted-service/subgraph/nftstorage/eip721-subgraph

const INGEST_BATCH_SIZE = 10
const SUBGRAPH_URL = process.env.SUBGRAPH_URL

function makeTheGraphQuery(time, offset) {
  return `
{
  tokens(
    first: ${INGEST_BATCH_SIZE}
    skip: ${offset}
    orderBy: mintTime
    where: { mintTime_gt: ${time} })
  {
    id
    tokenID
    mintTime
    tokenURI
    blockNumber
    blockHash
    contract {
        id
        name
        symbol
        supportsEIP721Metadata
    }
    owner {
        id
    }
  }
}
`
}

export async function fetchNFTs(event, context) {
  console.log(process.env.MY_ENV_VAR)
  const { detail } = event

  const { rangeStartTime, rangeEndTime } = detail

  //Divice by 1000 because the-graph's smallest resolution is 1s

  const hasBinRange = checkIsBinRange(rangeStartTime, rangeEndTime)

  if (!hasBinRange) {
    console.table({
      rangeStartTime,
      rangeEndTime,
      startIsDate: isDate(rangeStartTime),
      endIsDate: isDate(rangeEndTime),
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Invalid Bin Range: ${rangeStartTime} to ${rangeEndTime}`,
      }),
    }
  }

  const startOfTime = dateInSeconds(rangeStartTime)
  const endOfTime = dateInSeconds(rangeEndTime)

  const cursor = new Cursor(startOfTime)
  let nftBatch = []
  const results = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: makeTheGraphQuery(cursor.time, cursor.offset),
      variables: null,
    }),
  })

  nftBatch = await results.json()

  //TODO: better unhappy path, DLQ
  nftBatch = nftBatch?.data?.tokens || nftBatch

  if (nftBatch.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `📤 Scraped ${nftBatch.length} nfts from Subgraph.`,
      }),
    }
  }

  //TODO: handle paging better here.
  for (const nft of nftBatch) {
    sqs.sendMessage({
      QueueUrl: process.env.fetchedRecordQueueUrl,
      MessageBody: JSON.stringify(nft),
    })
    cursor.advanceOffset(nft.mintTime)
  }

  console.table({
    time: cursor.time,
    offset: cursor.offset,
  })

  const queueAttrs = await sqs.getQueueAttributes({
    QueueUrl: process.env.fetchedRecordQueueUrl,
    AttributeNames: ['ApproximateNumberOfMessages'],
  })

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `📤 Scraped ${nftBatch.length} nfts from Subgraph.`,
      //data: nftBatch,
      //   queueSize: queueAttrs,
    }),
  }
}

/* Maps from the graph to our DB */
export function tranformIn(token) {
  const {
    id,
    tokenID,
    mintTime,
    tokenURI,
    blockNumber,
    blockHash,
    contract,
    owner,
  } = token
  return {
    id,
    tokenID: tokenID.toString() || '',
    mintTime: mintTime.toString() || '',
    tokenURI: tokenURI.toString(),
    blockNumber,
    blockHash,
    contract: {
      id: contract.id || '',
      name: contract.name || '',
      symbol: contract.symbol || '',
      supportsEIP721Metadata: contract.supportsEIP721Metadata,
    },
    owner: {
      id: owner.id,
    },
  }
}