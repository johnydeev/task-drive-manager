// Corre una vez al iniciar el server de Next. Arranca el scheduler de recordatorios push
// (solo runtime Node, solo producción — ver lib/recordatorios-scheduler). No se await-ea
// nada del scheduler: register debe terminar antes de servir requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarSchedulerRecordatorios } = await import("./lib/recordatorios-scheduler");
  iniciarSchedulerRecordatorios();
}
