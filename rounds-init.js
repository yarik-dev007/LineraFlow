const axios = require('axios')
const config = require('./config')

config.loadEnv()

function now() { return new Date().toISOString() }
function log() { const args = Array.from(arguments); console.log(`[${now()}] [rounds-init]`, ...args) }
function warn() { const args = Array.from(arguments); console.warn(`[${now()}] [rounds-init]`, ...args) }
function error() { const args = Array.from(arguments); console.error(`[${now()}] [rounds-init]`, ...args) }
function compactStr(v) { return String(v).replace(/\s+/g, ' ').trim() }
function trunc(s, n = 1000) { try { const t = typeof s === 'string' ? s : JSON.stringify(s); return t.length > n ? t.slice(0, n) + '…' : t } catch { try { const t = String(s); return t.length > n ? t.slice(0, n) + '…' : t } catch { return '' } } }

async function postMutation(endpoint, query) {
  const q = compactStr(query)
  log('POST', endpoint, 'query:', q)
  const res = await axios.post(endpoint, { query }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 15000, validateStatus: () => true })
  log('HTTP', res.status, res.statusText)
  const raw = res?.data
  if (raw?.errors) { error('GraphQL errors:', trunc(raw.errors)); throw new Error(JSON.stringify(raw.errors)) }
  const data = raw?.data
  const keys = Object.keys(data || {})
  log('RESPONSE keys=' + keys.join(','), 'size=' + (JSON.stringify(raw || {}).length))
  log('RESPONSE preview=', trunc(raw))
  return data
}

async function runMutation(endpoint, label, name, query) {
  log('mut', label, name)
  try {
    const data = await postMutation(endpoint, query)
    const val = data?.[name]
    log('ok', label, name, val === undefined ? 'OK' : val)
    return data
  } catch (e) {
    error('fail', label, name, e?.message || e)
    throw e
  }
}

function extractChainId(endpointUrl) { const m = String(endpointUrl).match(/\/chains\/([^\/]+)/); return m ? m[1] : null }

function overrideApplicationId(endpoint, appId) {
  try {
    const i = endpoint.indexOf('/applications/')
    if (i === -1) return endpoint
    const base = endpoint.substring(0, i + '/applications/'.length)
    return base + String(appId)
  } catch { return endpoint }
}

async function initChain(label, endpoint, lbChainId, microbetAppId) {
  log('init', label, 'endpoint=', endpoint)
  if (!endpoint) throw new Error('missing endpoint')
  if (!microbetAppId) throw new Error('missing microbet app id')
  if (lbChainId) { await runMutation(endpoint, label, 'setLeaderboardChainId', `mutation { setLeaderboardChainId(chainId: "${lbChainId}") }`) } else { warn('skip setLeaderboardChainId: missing leaderboard chain id for', label) }
  await runMutation(endpoint, label, 'setMicrobetAppId', `mutation { setMicrobetAppId(microbetAppId: "${microbetAppId}") }`)
  await runMutation(endpoint, label, 'createRound', `mutation { createRound }`)
  await runMutation(endpoint, label, 'closeRound', `mutation { closeRound(closingPrice: "1") }`)
  log('done', label)
}

async function start() {
  const BTC_HTTP = config.endpoints.BTC
  const ETH_HTTP = config.endpoints.ETH
  const LB_BTC_EP = config.endpoints.LEADERBOARD_BTC
  const LB_ETH_EP = config.endpoints.LEADERBOARD_ETH
  const lbBtc = process.env.VITE_LEADERBOARD_BTC_CHAIN_ID || extractChainId(LB_BTC_EP) || process.env.VITE_LEADERBOARD_CHAIN_ID
  const lbEth = process.env.VITE_LEADERBOARD_ETH_CHAIN_ID || extractChainId(LB_ETH_EP) || process.env.VITE_LEADERBOARD_CHAIN_ID
  const microbetId = process.env.MICROBETREAL || process.env.VITE_MICROBET_APPLICATION_ID || process.env.VITE_LINERA_APPLICATION_ID
  const LOTTERY_HTTP = config.endpoints.LOTTERY
  const lotteryAppId = process.env.LOTTERY_APP || process.env.VITE_LOTTERY_APPLICATION_ID

  // Mint funds for bot wallet on its endpoint
  const BOT_ENDPOINT = process.env.LOTTERY_BOT_HTTP || process.env.BOT_HTTP
  const BOT_OWNER = process.env.LOTTERY_BOT_OWNER || process.env.BOT_OWNER
  const NATIVE_APP_ID = process.env.NATIVE_APP_ID || process.env.VITE_NATIVE_APPLICATION_ID
  const BOT_MINT_ENDPOINT = (BOT_ENDPOINT && NATIVE_APP_ID) ? overrideApplicationId(BOT_ENDPOINT, NATIVE_APP_ID) : null
  if (BOT_MINT_ENDPOINT && BOT_OWNER) {
    try {
      await runMutation(BOT_MINT_ENDPOINT, 'bot', 'mint', `mutation { mint(owner: "${BOT_OWNER}", amount: "15") }`)
    } catch (e) {
      warn('bot mint failed:', e?.message || e)
    }
  } else {
    warn('skip bot mint: missing BOT endpoint, owner or native app id')
  }

  if (LOTTERY_HTTP && lotteryAppId) { await runMutation(LOTTERY_HTTP, 'lottery', 'setLotteryAppId', `mutation { setLotteryAppId(lotteryAppId: "${lotteryAppId}") }`) } else { warn('skip setLotteryAppId: missing endpoint or lottery app id') }
  if (LOTTERY_HTTP) { await runMutation(LOTTERY_HTTP, 'lottery', 'createRound', `mutation { createRound(ticketPrice: "1") }`) } else { warn('skip lottery createRound: missing endpoint') }
  await initChain('btc', BTC_HTTP, lbBtc, microbetId)
  await initChain('eth', ETH_HTTP, lbEth, microbetId)
}

if (require.main === module) { start().catch((e) => { error('fatal', e?.message || e); process.exit(1) }) }

module.exports = { start }
