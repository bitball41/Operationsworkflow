(function () {
  /* OpenScout may keep a location only for the current page session. Operational
     records and API keys are never written to browser storage. */
  let locationGuess = null;

  window.OpenScout = window.OpenScout || {};
  window.OpenScout.storage = {
    getApiKey() {
      return "";
    },
    setApiKey() {
      return "";
    },
    getLocationGuess() {
      return locationGuess;
    },
    setLocationGuess(value) {
      const next = {
        label: String(value?.label || "").trim(),
        lat: Number(value?.lat),
        lng: Number(value?.lng),
        accuracy: Number(value?.accuracy) || null,
      };
      locationGuess = next.label && Number.isFinite(next.lat) && Number.isFinite(next.lng) ? next : null;
      return locationGuess;
    },
    clearLocationGuess() {
      locationGuess = null;
    },
  };
})();
