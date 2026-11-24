// Documentos fiscais: validação de CNPJ e da chave de acesso da NF-e/NFC-e (44 dígitos, dígito verificador módulo 11).
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export function cnpjValido(v) {
  const c = soDigitos(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export const formatarCnpj = (v) => soDigitos(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export function chaveValida(v) {
  const c = soDigitos(v); if (c.length !== 44) return false;
  let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(c[i]) * p; p = p === 9 ? 2 : p + 1; }
  const r = s % 11, dv = r < 2 ? 0 : 11 - r; return dv === Number(c[43]);
}

/** Lê o que a própria chave já informa: UF, mês de emissão, CNPJ do emitente, modelo, série e número. */
export function lerChave(v) {
  const c = soDigitos(v); if (!chaveValida(c)) return null;
  const aa = c.slice(2, 4), mm = c.slice(4, 6);
  return { uf: c.slice(0, 2), mes: `20${aa}-${mm}`, cnpj: c.slice(6, 20), modelo: c.slice(20, 22), serie: String(Number(c.slice(22, 25))), numero: String(Number(c.slice(25, 34))) };
}
export { soDigitos };
