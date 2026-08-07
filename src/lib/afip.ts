import "server-only";
import Afip from "@afipsdk/afip.js";
import { getServerEnv } from "@/lib/env";
import type { ArcaCondicionFiscal, ArcaEnvironment, ClientIvaCondition } from "@/types/database";

// CUIT de pruebas provisto por Afip SDK: permite emitir comprobantes de
// homologacion (WSFEv1 de testing) sin certificado propio, para probar el
// flujo completo antes de tener un certificado real de ARCA. Verificado a
// mano contra la API: con este CUIT y sin cert/key, ARCA devuelve un CAE de
// prueba real (confirmar el numero exacto si Afip SDK lo llegara a cambiar).
const DEMO_CUIT = "20409378472";

const CBTE_TIPO_FACTURA_A = 1;
const CBTE_TIPO_FACTURA_B = 6;
const CBTE_TIPO_FACTURA_C = 11;

// Alicuota de IVA 21% (id segun tabla FEParamGetTiposIva de ARCA).
const IVA_ALICUOTA_21_ID = 5;

// CondicionIVAReceptorId (obligatorio en WSFEv1 desde la RG que unifico
// AFIP/ARCA): mapea la condicion de IVA del cliente al id que espera ARCA.
const IVA_CONDICION_RECEPTOR_ID: Record<ClientIvaCondition, number> = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  monotributo: 6,
};

export type ArcaOrgConfig = {
  cuit: string | null;
  condicionFiscal: ArcaCondicionFiscal | null;
  puntoVenta: number | null;
  environment: ArcaEnvironment;
  cert: string | null;
  privateKey: string | null;
};

export function resolveVoucherType(
  orgCondicionFiscal: ArcaCondicionFiscal,
  clientIvaCondition: ClientIvaCondition | null,
) {
  if (orgCondicionFiscal === "monotributo") return CBTE_TIPO_FACTURA_C;
  return clientIvaCondition === "responsable_inscripto" ? CBTE_TIPO_FACTURA_A : CBTE_TIPO_FACTURA_B;
}

function resolveDocTipoNro(taxId: string | null) {
  const digits = (taxId ?? "").replace(/\D/g, "");
  if (digits.length === 11) return { DocTipo: 80, DocNro: Number(digits) }; // CUIT
  if (digits.length === 7 || digits.length === 8) return { DocTipo: 96, DocNro: Number(digits) }; // DNI
  return { DocTipo: 99, DocNro: 0 }; // Consumidor final
}

export function getAfipClient(config: ArcaOrgConfig) {
  const env = getServerEnv();
  if (!env.AFIPSDK_ACCESS_TOKEN) {
    throw new Error("Falta configurar AFIPSDK_ACCESS_TOKEN.");
  }

  // Sin certificado propio todavia: cae al CUIT demo de homologacion de
  // Afip SDK en vez de fallar, para poder probar el flujo end-to-end sin
  // clave fiscal propia. En produccion (o si ya cargaron cert/key) se usa
  // siempre el CUIT y certificado reales de la organizacion.
  const useDemo = !config.cert || !config.privateKey;
  if (!useDemo && !config.cuit) {
    throw new Error("Falta configurar el CUIT en Facturacion electronica (ARCA).");
  }

  const cuit = useDemo ? DEMO_CUIT : String(config.cuit);

  const afip = new Afip({
    CUIT: useDemo ? DEMO_CUIT : Number(config.cuit),
    production: useDemo ? false : config.environment === "produccion",
    cert: useDemo ? undefined : (config.cert ?? undefined),
    key: useDemo ? undefined : (config.privateKey ?? undefined),
    access_token: env.AFIPSDK_ACCESS_TOKEN,
  });

  return { afip, cuit };
}

export type AuthorizeInvoiceInput = {
  orgConfig: ArcaOrgConfig;
  totalCents: number;
  clientTaxId: string | null;
  clientIvaCondition: ClientIvaCondition | null;
};

export type AuthorizeInvoiceResult = {
  cae: string;
  caeVencimiento: string;
  comprobanteTipo: number;
  comprobanteNumero: number;
  puntoVenta: number;
  cuit: string;
  docTipo: number;
  docNro: number;
};

export async function authorizeOrderInvoice({
  orgConfig,
  totalCents,
  clientTaxId,
  clientIvaCondition,
}: AuthorizeInvoiceInput): Promise<AuthorizeInvoiceResult> {
  if (!orgConfig.condicionFiscal) {
    throw new Error("Falta configurar la condicion fiscal en Facturacion electronica (ARCA).");
  }
  if (!orgConfig.puntoVenta) {
    throw new Error("Falta configurar el punto de venta en Facturacion electronica (ARCA).");
  }

  const cbteTipo = resolveVoucherType(orgConfig.condicionFiscal, clientIvaCondition);
  const isFacturaC = cbteTipo === CBTE_TIPO_FACTURA_C;
  const { DocTipo, DocNro } = resolveDocTipoNro(clientTaxId);

  const total = Math.round(totalCents) / 100;
  // Factura C (monotributo): no discrimina IVA, ImpNeto = ImpTotal. Factura
  // A/B (responsable inscripto): asumimos price_cents ya incluye un unico
  // 21% de IVA (caso estandar de reventa de productos). Si a futuro hay
  // alicuotas mixtas o exentas esto necesita revisarse puntualmente.
  const impNeto = isFacturaC ? total : Math.round((total / 1.21) * 100) / 100;
  const impIVA = isFacturaC ? 0 : Math.round((total - impNeto) * 100) / 100;

  const today = new Date();
  const cbteFch = Number(
    `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
  );

  const data: Record<string, unknown> = {
    PtoVta: orgConfig.puntoVenta,
    CbteTipo: cbteTipo,
    Concepto: 1, // Productos
    DocTipo,
    DocNro,
    CbteFch: cbteFch,
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: impNeto,
    ImpOpEx: 0,
    ImpIVA: impIVA,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: IVA_CONDICION_RECEPTOR_ID[clientIvaCondition ?? "consumidor_final"],
  };

  if (!isFacturaC && impIVA > 0) {
    data.Iva = [{ Id: IVA_ALICUOTA_21_ID, BaseImp: impNeto, Importe: impIVA }];
  }

  const { afip, cuit } = getAfipClient(orgConfig);
  const result = await afip.ElectronicBilling.createNextVoucher(data);

  return {
    cae: result.CAE,
    caeVencimiento: result.CAEFchVto,
    comprobanteTipo: cbteTipo,
    comprobanteNumero: result.voucherNumber,
    puntoVenta: orgConfig.puntoVenta,
    cuit,
    docTipo: DocTipo,
    docNro: DocNro,
  };
}
