# Wagmi Omnichain Indexer

A price tracking and liquidity indexer service for the Wagmi Omnichain Protocol's Uniswap V3 fork on Sonic.

## Features

- 📊 **Pool Indexing**: Automatically indexes all pools from the Uniswap V3 Factory
- 💰 **Price Tracking**: Real-time price calculation from sqrtPriceX96 and tick
- 📈 **Historical Data**: Stores 1 year of price history for charts
- 🕯️ **OHLCV Candles**: Pre-aggregated candles for TradingView-style charts
- 🔄 **Swap Helper**: Get quotes and find best routes for swaps
- ⚡ **Fast API**: Express-based REST API for frontend integration

## Setup

```bash
cd indexer
npm install
```

### Environment Variables

Create a `.env` file:

```env
# Sonic RPC URL
RPC_URL=https://rpc.soniclabs.com

# Database path (SQLite)
DB_PATH=./data/indexer.db

# API Server port
PORT=3001
```

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Manual Scripts

```bash
# Index all pools
npm run index

# Sync prices
npm run sync
```

## API Endpoints

### Pools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pools` | GET | List all pools |
| `/api/pools/:address` | GET | Get pool details |
| `/api/pools/pair/:token0/:token1` | GET | Find pools by token pair |

### Prices & Charts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/prices/:poolAddress` | GET | Current price + 24h change |
| `/api/prices/:poolAddress/history` | GET | Price history (raw) |
| `/api/prices/:poolAddress/candles` | GET | OHLCV candles for charts |

**Query parameters for history:**
- `from`: Start timestamp (default: 7 days ago)
- `to`: End timestamp (default: now)
- `limit`: Max records (default: 1000)

**Query parameters for candles:**
- `interval`: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w` (default: `1h`)
- `from`: Start timestamp (default: 30 days ago)
- `to`: End timestamp (default: now)

### Swap Helper

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/quote` | GET | Get swap quote |
| `/api/route` | GET | Find best swap route |

**Query parameters for quote:**
- `tokenIn`: Input token address
- `tokenOut`: Output token address
- `amountIn`: Input amount
- `fee`: Fee tier (default: 3000)

### Tokens

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tokens` | GET | List all tokens |
| `/api/tokens/:address` | GET | Get token details + pools |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/status` | GET | Indexer status |
| `/api/admin/sync/pools` | POST | Trigger pool sync |
| `/api/admin/sync/prices` | POST | Trigger price snapshot |

## Response Format

All responses follow this format:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Example Usage

### Get Current Price

```bash
curl http://localhost:3001/api/prices/0x...poolAddress
```

Response:
```json
{
  "success": true,
  "data": {
    "price0": "1850.234567",
    "price1": "0.000540",
    "change_24h": {
      "change": 25.5,
      "changePercent": 1.4
    }
  }
}
```

### Get Candles for Chart

```bash
curl "http://localhost:3001/api/prices/0x...poolAddress/candles?interval=1h&from=1700000000"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "timestamp": 1700000000,
      "open": "1800.00",
      "high": "1820.50",
      "low": "1795.25",
      "close": "1815.00",
      "volume_token0": "150.5",
      "volume_token1": "270000"
    }
  ]
}
```

### Get Swap Quote

```bash
curl "http://localhost:3001/api/quote?tokenIn=0x...&tokenOut=0x...&amountIn=1.0"
```

Response:
```json
{
  "success": true,
  "data": {
    "amountIn": "1.0",
    "amountOut": "1850.234567",
    "sqrtPriceX96After": "...",
    "gasEstimate": "150000",
    "fee": 3000
  }
}
```

## Architecture

```
indexer/
├── src/
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration
│   ├── db/
│   │   └── database.ts    # SQLite database setup
│   ├── abis/
│   │   └── index.ts       # Contract ABIs
│   ├── utils/
│   │   └── price.ts       # Price calculation utilities
│   ├── services/
│   │   ├── poolIndexer.ts # Pool indexing service
│   │   └── priceTracker.ts# Price tracking service
│   ├── api/
│   │   └── routes.ts      # Express API routes
│   └── scripts/
│       ├── indexPools.ts  # Manual pool indexer
│       └── syncPrices.ts  # Manual price sync
└── data/
    └── indexer.db         # SQLite database
```

## Scheduled Tasks

The indexer runs these tasks automatically:

- **Every minute**: Update pool states and take price snapshots
- **Every hour**: Re-index pools to catch new ones
- **Daily at midnight**: Clean old price snapshots (>1 year)

## Integration with Frontend

Example React hook to fetch candles:

```typescript
const useCandles = (poolAddress: string, interval: string) => {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCandles = async () => {
      const res = await fetch(
        `http://localhost:3001/api/prices/${poolAddress}/candles?interval=${interval}`
      );
      const data = await res.json();
      if (data.success) {
        setCandles(data.data);
      }
      setLoading(false);
    };

    fetchCandles();
    const interval = setInterval(fetchCandles, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [poolAddress, interval]);

  return { candles, loading };
};
```

## Contract Addresses (Sonic)

- **Factory**: `0x3a1713B6C3734cfC883A3897647f3128Fe789f39`
- **SwapRouter**: `0x8BbF9fF8CE8060B85DFe48d7b7E897d09418De9B`
- **NonfungiblePositionManager**: `0x5826e10B513C891910032F15292B2F1b3041C3Df`
- **QuoterV2**: `0x57e3e0a9DfB3DA34cc164B2C8dD1EBc404c45d47`
- **WETH9**: `0xBFF7867E7e5e8D656Fc0B567cE7672140D208235`



