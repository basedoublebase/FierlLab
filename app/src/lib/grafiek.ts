// Gedeelde grafiek-helpers.

// "Nette" as: ronde stapgrootte + domein dat strak om de data sluit, met genoeg
// decimalen zodat elk ticklabel uniek is.
export function netteAs(min: number, max: number, doel = 5) {
  const bereik = Math.max(max - min, 1e-9);
  const ruw = bereik / doel;
  const mag = Math.pow(10, Math.floor(Math.log10(ruw)));
  const norm = ruw / mag;
  const stap = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const domMin = Math.floor(min / stap) * stap;
  const domMax = Math.ceil(max / stap) * stap;
  const decimalen = Math.max(0, -Math.floor(Math.log10(stap)));
  const ticks: number[] = [];
  for (let v = domMin; v <= domMax + stap / 2; v += stap) ticks.push(Math.round(v / stap) * stap);
  return { domMin, domMax, ticks, decimalen };
}
