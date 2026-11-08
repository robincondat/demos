importScripts("../../shared/scripts/scientific-worker.js?v=20261106-tds3");

const pyodidePromise = createScientificWorker({
  sharedURL: new URL("../../shared/", self.location.href).href,
  engineURL: new URL("./scientific.py?v=20261106-tds3", self.location.href).href,
  modules: ["tds_signals", "tds_fourier"],
});
