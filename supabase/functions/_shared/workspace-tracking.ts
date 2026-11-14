export function encodeClickRef(ref: string, invisible = false) {
  if (!/^[a-f0-9]{16}$/i.test(ref)) throw Error("Referência inválida.");
  return invisible
    ? "\u2063" +
        [...ref]
          .map((c) =>
            parseInt(c, 16)
              .toString(2)
              .padStart(4, "0")
              .replace(/0/g, "\u200b")
              .replace(/1/g, "\u200c"),
          )
          .join("") +
        "\u2063"
    : "Ref: CG-" + ref;
}
export function decodeClickRef(body: string) {
  const visible = body.match(/CG-([a-f0-9]{16})/i);
  if (visible) return visible[1].toLowerCase();
  const bits = body.match(/\u2063([\u200b\u200c]{64})\u2063/);
  if (!bits) return "";
  return bits[1].replace(/[\u200b\u200c]{4}/g, (b) =>
    parseInt(b.replace(/\u200b/g, "0").replace(/\u200c/g, "1"), 2).toString(16),
  );
}
export function googleConversionCsv(
  rows: {
    gclid: string;
    name: string;
    time: string;
    value: string;
    currency: string;
  }[],
) {
  const cell = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return (
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n" +
    rows
      .map((r) =>
        [r.gclid, r.name, r.time, r.value, r.currency].map(cell).join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function trackingSiteScript(base: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Link inválido.");
  const dest = new URL(base);
  dest.searchParams.set("link", token);
  return `(function(){var keys=['gclid','gbraid','wbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];var current=new URLSearchParams(location.search);var attrs={};try{var old=JSON.parse(localStorage.getItem('cg_attribution')||'null');if(old&&Date.now()-old.time<7776000000)attrs=old.attrs||{};}catch(e){}if(current.has('fbclid')){delete attrs.gclid;delete attrs.gbraid;delete attrs.wbraid;}if(current.has('gclid')||current.has('gbraid')||current.has('wbraid'))delete attrs.fbclid;keys.forEach(function(k){var v=current.get(k);if(v&&v.length<=500)attrs[k]=v;});try{localStorage.setItem('cg_attribution',JSON.stringify({time:Date.now(),attrs:attrs}));}catch(e){}document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var u;try{u=new URL(a.href);}catch(err){return;}if(!['wa.me','api.whatsapp.com','web.whatsapp.com'].includes(u.hostname))return;var target=new URL(${JSON.stringify(dest.toString())});keys.forEach(function(k){if(attrs[k])target.searchParams.set(k,attrs[k]);});target.searchParams.set('source_url',location.origin+location.pathname);a.href=target.toString();},true);})();`;
}
