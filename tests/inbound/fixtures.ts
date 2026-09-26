/**
 * Fictitious fiscal documents for tests. CNPJs and access keys have valid check digits;
 * no real company data.
 */

export const SUPPLIER_CNPJ = "12345678000195";
export const OFFICE_CLIENT_CNPJ = "98765432000198";
export const ALNUM_CNPJ = "12ABC34501DE35"; // official example from Receita Federal
export const NFE_KEY = "43260912345678000195550010000012341876543213";
export const NFE_KEY_ALNUM = "43260912ABC34501DE35550010000000991112233449";
export const NFSE_KEY = "43149022" + "1" + SUPPLIER_CNPJ + "0000000000042" + "2609" + "123456789" + "7";

export function nfeProcXml(opts: { key?: string; emit?: string; dest?: string; withIbsCbs?: boolean } = {}): string {
  const key = opts.key ?? NFE_KEY;
  const emit = opts.emit ?? SUPPLIER_CNPJ;
  const dest = opts.dest ?? OFFICE_CLIENT_CNPJ;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${key}" versao="4.00">
      <ide><cUF>43</cUF><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-09-20T10:15:00-03:00</dhEmi></ide>
      <emit><CNPJ>${emit}</CNPJ><xNome>Distribuidora Exemplo Ltda</xNome></emit>
      <dest><CNPJ>${dest}</CNPJ><xNome>Cliente do Escritorio SA</xNome></dest>
      <det nItem="1"><prod><xProd>Parafuso sextavado</xProd><NCM>73181500</NCM><CFOP>5102</CFOP><qCom>100.0000</qCom><vUnCom>0.5000000000</vUnCom><vProd>50.00</vProd></prod></det>
      <det nItem="2"><prod><xProd>Porca M8</xProd><NCM>73181600</NCM><CFOP>5102</CFOP><qCom>200.0000</qCom><vUnCom>0.2500000000</vUnCom><vProd>50.00</vProd></prod></det>
      <total>
        <ICMSTot><vProd>100.00</vProd><vFrete>10.00</vFrete><vICMS>18.00</vICMS><vIPI>0.00</vIPI><vPIS>0.65</vPIS><vCOFINS>3.00</vCOFINS><vNF>110.00</vNF></ICMSTot>
        ${opts.withIbsCbs ? "<IBSCBSTot><gIBS><vIBS>0.10</vIBS></gIBS><gCBS><vCBS>0.90</vCBS></gCBS></IBSCBSTot>" : ""}
      </total>
      <cobr><dup><nDup>002</nDup><dVenc>2026-11-20</dVenc><vDup>55.00</vDup></dup><dup><nDup>001</nDup><dVenc>2026-10-20</dVenc><vDup>55.00</vDup></dup></cobr>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe>
</nfeProc>`;
}

export function nfseNacionalXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS${NFSE_KEY}">
    <nNFSe>42</nNFSe>
    <dhProc>2026-09-21T09:00:00-03:00</dhProc>
    <emit><CNPJ>${SUPPLIER_CNPJ}</CNPJ><xNome>Consultoria Exemplo Ltda</xNome></emit>
    <valores><vISSQN>50.00</vISSQN><vLiq>1000.00</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <serie>1</serie><nDPS>42</nDPS><dCompet>2026-09-21</dCompet><dhEmi>2026-09-21T08:55:00-03:00</dhEmi>
        <prest><CNPJ>${SUPPLIER_CNPJ}</CNPJ></prest>
        <toma><CNPJ>${OFFICE_CLIENT_CNPJ}</CNPJ><xNome>Cliente do Escritorio SA</xNome></toma>
        <serv><cServ><cTribNac>010701</cTribNac><xDescServ>Suporte técnico em TI</xDescServ></cServ></serv>
        <valores><vServPrest><vServ>1000.00</vServ></vServPrest><vISSQN>50.00</vISSQN></valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;
}

/** Banco do Brasil example widely used in FEBRABAN documentation: R$ 1,00 */
export const BOLETO_LINE_VALID = "00190500954014481606906809350314337370000000100";
