// Reproducible computational experiment, version 1. No dependencies.
// Run: node monte-carlo.mjs baseline | node monte-carlo.mjs antithetic
const mode = process.argv[2];
if (!['baseline', 'antithetic'].includes(mode)) throw Error('Choose baseline or antithetic');
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = 1000, trials = 500, exact = 1 / 3;
const estimates = [];
for (let seed = 1; seed <= trials; seed++) {
  const random = mulberry32(seed);
  let sum = 0;
  if (mode === 'baseline') {
    for (let i = 0; i < n; i++) { const u = random(); sum += u * u; }
  } else {
    for (let i = 0; i < n / 2; i++) { const u = random(); sum += u * u + (1-u) * (1-u); }
  }
  estimates.push(sum / n);
}
const mean = estimates.reduce((a,b) => a+b, 0) / trials;
const variance = estimates.reduce((a,b) => a+(b-mean)**2, 0) / (trials-1);
const mse = estimates.reduce((a,b) => a+(b-exact)**2, 0) / trials;
console.log(JSON.stringify({mode,n,trials,seeds:'1..500',exact,mean,bias:mean-exact,variance,mse,rmse:Math.sqrt(mse),mean_standard_error:Math.sqrt(variance/trials)},null,2));
