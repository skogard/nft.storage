import settle from 'p-settle'
import {
  UPLOAD_TYPES,
  PIN_SERVICES,
  PIN_STATUSES,
} from '../../../api/src/utils/db-client.js'

/**
 * @typedef {import('pg').Client} Client
 * @typedef {{ name: string, value: number }} Metric
 */

const COUNT_USERS = 'SELECT COUNT(*) AS total FROM public.user'

const COUNT_UPLOADS = 'SELECT COUNT(*) AS total FROM upload WHERE type = $1'

const TOTAL_UPLOADS_PAST_7 =
  'SELECT COUNT(*) FROM upload WHERE inserted_at > CURRENT_DATE - 7'
const TOTAL_DEALS = 'SELECT COUNT(*) from cargo.deals'
const TOTAL_DEALS_SIZE =
  'SELECT SUM(export_size) as total_deals_size from cargo.aggregates'

const COUNT_PINS =
  'SELECT COUNT(*) AS total FROM pin WHERE service = $1 AND status = $2'

const SUM_CONTENT_DAG_SIZE = `SELECT SUM(c.dag_size) AS "total" FROM content c`

const UPDATE_METRIC = `
INSERT INTO metric (name, value, updated_at)
     VALUES ($1, $2, TIMEZONE('utc', NOW()))
ON CONFLICT (name) DO UPDATE
        SET value = $2, updated_at = TIMEZONE('utc', NOW())
`

/**
 * Calculate metrics from RO DB and update their current values in the RW DB.
 *
 * @param {{ rwPg: Client, roPg: Client }} config
 */
export async function updateMetrics({ roPg, rwPg }) {
  const results = await settle([
    updateUsersCount(roPg, rwPg),
    updateTotalUploadPast7(roPg, rwPg),
    updateTotalDeals(roPg, rwPg),
    updateTotalDealsSize(roPg, rwPg),
    updateContentRootDagSizeSum(roPg, rwPg),
    ...UPLOAD_TYPES.map((t) => updateUploadsCount(roPg, rwPg, t)),
    ...PIN_SERVICES.map((svc) =>
      PIN_STATUSES.map((s) => updatePinsCount(roPg, rwPg, svc, s))
    ).flat(),
  ])

  let error
  for (const promise of results) {
    if (promise.isFulfilled) continue
    error = error || promise.reason
    console.error(promise.reason)
  }

  if (error) throw error
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 */
async function updateContentRootDagSizeSum(roPg, rwPg) {
  const { rows } = await roPg.query(SUM_CONTENT_DAG_SIZE)
  if (!rows.length) throw new Error('no rows returned counting users')
  await rwPg.query(UPDATE_METRIC, ['content_dag_size_total', rows[0].total])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 */
async function updateUsersCount(roPg, rwPg) {
  const { rows } = await roPg.query(COUNT_USERS)
  if (!rows.length) throw new Error('no rows returned counting users')
  await rwPg.query(UPDATE_METRIC, ['users_total', rows[0].total])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 */
async function updateTotalUploadPast7(roPg, rwPg) {
  const { rows } = await roPg.query(TOTAL_UPLOADS_PAST_7)
  if (!rows.length) throw new Error('no rows returned counting uploads')
  await rwPg.query(UPDATE_METRIC, ['total_uploads_past_7', rows[0].count])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 */
async function updateTotalDeals(roPg, rwPg) {
  const { rows } = await roPg.query(TOTAL_DEALS)
  if (!rows.length) throw new Error(`no rows returned counting total deals`)
  await rwPg.query(UPDATE_METRIC, [`total_deals`, rows[0].count])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 */
async function updateTotalDealsSize(roPg, rwPg) {
  const { rows } = await roPg.query(TOTAL_DEALS_SIZE)
  if (!rows.length) throw new Error(`no rows returned counting total deal size`)
  await rwPg.query(UPDATE_METRIC, [
    `total_deals_size`,
    rows[0].total_deals_size,
  ])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 * @param {string} type
 */
async function updateUploadsCount(roPg, rwPg, type) {
  const { rows } = await roPg.query(COUNT_UPLOADS, [type])
  if (!rows.length) throw new Error(`no rows returned counting ${type} uploads`)
  await rwPg.query(UPDATE_METRIC, [
    `uploads_${type.toLowerCase()}_total`,
    rows[0].total,
  ])
}

/**
 * @param {Client} roPg
 * @param {Client} rwPg
 * @param {string} service
 * @param {string} status
 */
async function updatePinsCount(roPg, rwPg, service, status) {
  const { rows } = await roPg.query(COUNT_PINS, [service, status])
  if (!rows.length)
    throw new Error(`no rows returned counting ${service} ${status} pins`)
  await rwPg.query(UPDATE_METRIC, [
    `pins_${service.toLowerCase()}_${status.toLowerCase()}_total`,
    rows[0].total,
  ])
}
