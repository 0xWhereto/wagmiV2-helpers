import { BigNumber } from 'ethers';

// Constants
const Q96 = BigNumber.from(2).pow(96);
const Q192 = BigNumber.from(2).pow(192);

/**
 * Convert sqrtPriceX96 to price (token1 per token0)
 * price = (sqrtPriceX96 / 2^96)^2
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: BigNumber | string,
  decimals0: number,
  decimals1: number
): { price0: string; price1: string } {
  const sqrtPrice = BigNumber.from(sqrtPriceX96);
  
  // Calculate price with high precision
  // price = sqrtPriceX96^2 / 2^192
  const numerator = sqrtPrice.mul(sqrtPrice);
  
  // Adjust for decimal difference
  const decimalAdjustment = 10 ** (decimals0 - decimals1);
  
  // price of token0 in terms of token1
  // We need to be careful with precision here
  const price0Num = numerator.mul(BigNumber.from(10).pow(18));
  const price0 = price0Num.div(Q192).toNumber() / 1e18 * decimalAdjustment;
  
  // price of token1 in terms of token0
  const price1 = price0 > 0 ? 1 / price0 : 0;
  
  return {
    price0: price0.toString(),
    price1: price1.toString(),
  };
}

/**
 * Convert tick to price
 * price = 1.0001^tick
 */
export function tickToPrice(
  tick: number,
  decimals0: number,
  decimals1: number
): { price0: string; price1: string } {
  const price0Raw = Math.pow(1.0001, tick);
  const decimalAdjustment = 10 ** (decimals0 - decimals1);
  const price0 = price0Raw * decimalAdjustment;
  const price1 = price0 > 0 ? 1 / price0 : 0;
  
  return {
    price0: price0.toString(),
    price1: price1.toString(),
  };
}

/**
 * Convert price to tick (approximate)
 * tick = log(price) / log(1.0001)
 */
export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

/**
 * Get price at specific tick boundaries
 */
export function getTickBoundaryPrices(
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): { priceLower: string; priceUpper: string } {
  const lower = tickToPrice(tickLower, decimals0, decimals1);
  const upper = tickToPrice(tickUpper, decimals0, decimals1);
  
  return {
    priceLower: lower.price0,
    priceUpper: upper.price0,
  };
}

/**
 * Calculate amounts from liquidity and price range
 */
export function getAmountsFromLiquidity(
  liquidity: BigNumber | string,
  sqrtPriceX96: BigNumber | string,
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): { amount0: string; amount1: string } {
  const L = BigNumber.from(liquidity);
  const sqrtP = BigNumber.from(sqrtPriceX96);
  
  // Convert ticks to sqrtPriceX96
  const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
  const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);
  
  let amount0 = BigNumber.from(0);
  let amount1 = BigNumber.from(0);
  
  if (sqrtP.lte(sqrtPriceLower)) {
    // Current price below range - all token0
    amount0 = L.mul(Q96).mul(sqrtPriceUpper.sub(sqrtPriceLower))
      .div(sqrtPriceLower).div(sqrtPriceUpper);
  } else if (sqrtP.lt(sqrtPriceUpper)) {
    // Current price in range
    amount0 = L.mul(Q96).mul(sqrtPriceUpper.sub(sqrtP))
      .div(sqrtP).div(sqrtPriceUpper);
    amount1 = L.mul(sqrtP.sub(sqrtPriceLower)).div(Q96);
  } else {
    // Current price above range - all token1
    amount1 = L.mul(sqrtPriceUpper.sub(sqrtPriceLower)).div(Q96);
  }
  
  return {
    amount0: formatUnits(amount0, decimals0),
    amount1: formatUnits(amount1, decimals1),
  };
}

/**
 * Convert tick to sqrtPriceX96
 */
export function tickToSqrtPriceX96(tick: number): BigNumber {
  const sqrtPrice = Math.sqrt(Math.pow(1.0001, tick));
  // Multiply by 2^96 and convert to BigNumber
  const sqrtPriceX96 = sqrtPrice * (2 ** 96);
  return BigNumber.from(Math.floor(sqrtPriceX96).toString());
}

/**
 * Format units helper
 */
function formatUnits(value: BigNumber, decimals: number): string {
  const divisor = BigNumber.from(10).pow(decimals);
  const intPart = value.div(divisor);
  const fracPart = value.mod(divisor);
  
  if (fracPart.isZero()) {
    return intPart.toString();
  }
  
  const fracStr = fracPart.toString().padStart(decimals, '0');
  return `${intPart}.${fracStr}`.replace(/\.?0+$/, '');
}

/**
 * Calculate price impact for a swap
 */
export function calculatePriceImpact(
  amountIn: string,
  amountOut: string,
  reserveIn: string,
  reserveOut: string
): number {
  const amtIn = parseFloat(amountIn);
  const amtOut = parseFloat(amountOut);
  const resIn = parseFloat(reserveIn);
  const resOut = parseFloat(reserveOut);
  
  if (resIn === 0 || resOut === 0) return 0;
  
  const spotPrice = resOut / resIn;
  const executionPrice = amtOut / amtIn;
  
  return Math.abs((executionPrice - spotPrice) / spotPrice) * 100;
}

/**
 * Format price for display
 */
export function formatPrice(price: string | number, decimals: number = 6): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  
  if (num === 0) return '0';
  if (num < 0.000001) return num.toExponential(4);
  if (num < 1) return num.toFixed(decimals);
  if (num < 1000) return num.toFixed(4);
  if (num < 1000000) return num.toFixed(2);
  
  return num.toExponential(4);
}

/**
 * Calculate TVL in USD (requires price feed)
 */
export function calculateTVL(
  amount0: string,
  amount1: string,
  price0USD: number,
  price1USD: number
): number {
  return parseFloat(amount0) * price0USD + parseFloat(amount1) * price1USD;
}



