(function () {
  const storageKey = "design-system:projects";

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function createProjectDraft(seed, name = null) {
    return {
      id: createId("proj"),
      name: name || seed?.specName || "Acme iOS 设计规范",
      updatedAt: new Date().toISOString(),
      draft: seed || null,
      versions: [],
    };
  }

  function listProjects(fallbackSeed) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // ignore corrupted local data and recreate a local project
    }
    return [createProjectDraft(fallbackSeed)];
  }

  function saveProjects(projects) {
    localStorage.setItem(storageKey, JSON.stringify(projects));
  }

  function saveLastPublished(versionPayload) {
    localStorage.setItem("design-system:last-published", JSON.stringify(versionPayload));
  }

  Object.assign(window, {
    DesignStorage: {
      createId,
      createProjectDraft,
      listProjects,
      saveProjects,
      saveLastPublished,
    },
  });
})();
