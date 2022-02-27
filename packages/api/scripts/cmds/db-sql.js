import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import retry from 'p-retry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { Client } = pg

/**
 * @param {{ reset?: boolean; cargo?: boolean; testing?: boolean; }} opts
 */
export async function dbSqlCmd(opts) {
  if (opts.cargo && !opts.testing) {
    expectEnv('DAG_CARGO_HOST')
    expectEnv('DAG_CARGO_DATABASE')
    expectEnv('DAG_CARGO_USER')
    expectEnv('DAG_CARGO_PASSWORD')
  }
  expectEnv('DATABASE_CONNECTION')
  const { env } = process

  if (env.ENV === 'test') expectEnv('TEST_DATABASE_CONNECTION')

  const configSql = loadSql('config.sql')
  const tables = loadSql('tables.sql')
  const functions = loadSql('functions.sql')
  const reset = loadSql('reset.sql')
  const cargo = loadSql('cargo.sql')
  const cargoTesting = loadSql('cargo.testing.sql')
  const fdw = loadSql('fdw.sql')
    // Replace secrets in the FDW sql file
    .replace(":'DAG_CARGO_HOST'", `'${env.DAG_CARGO_HOST}'`)
    .replace(":'DAG_CARGO_DATABASE'", `'${env.DAG_CARGO_DATABASE}'`)
    .replace(":'DAG_CARGO_USER'", `'${env.DAG_CARGO_USER}'`)
    .replace(":'DAG_CARGO_PASSWORD'", `'${env.DAG_CARGO_PASSWORD}'`)
    .replace(':NFT_STORAGE_USER', env.NFT_STORAGE_USER || 'CURRENT_USER')

  const dbConnection =
    env.ENV === 'test' ? env.TEST_DATABASE_CONNECTION : env.DATABASE_CONNECTION
  const client = await getDbClient(dbConnection)

  // if resetting, run post reset commands here
  if (opts.reset) {
    try {
      await client.query(reset).catch((err) => {})
    } catch (err) {
      // do nothing
    }
  }

  await client.query(configSql)
  await client.query(tables).catch((err) => {})
  await client.query(functions)

  if (opts.cargo) {
    if (opts.testing) {
      await client.query(cargoTesting).catch((err) => {})
    } else {
      await client.query(fdw)
      console.log('post non testing cargo')
    }
    await client.query(cargo).catch((err) => {})
  }

  await client.end()
}

/**
 * @param {string|undefined} connectionString
 */
function getDbClient(connectionString) {
  return retry(
    async () => {
      const c = new Client({ connectionString })
      await c.connect()
      return c
    },
    { minTimeout: 100 }
  )
}

/**
 * @param {string} name
 */
function expectEnv(name) {
  if (!process.env[name]) {
    throw new Error(`missing environment variable: ${name}`)
  }
}

/**
 * @param {string} file
 */
function loadSql(file) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'db', file), 'utf8')
}
