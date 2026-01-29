/* ==========================================================================
   POG API Module (Ver.0.3.0)
   ========================================================================== */
const POG_API = {
    async fetchStatus() {
        const res = await fetch('/status');
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return await res.json();
    },
    async search(f, m, signal) {
        const res = await fetch(`/search_horses?f=${encodeURIComponent(f)}&m=${encodeURIComponent(m)}`, { signal });
        if (!res.ok) throw new Error("検索リクエストに失敗しました");
        return await res.json();
    },
    async postNomination(name, mother, father = '', sex = '') {
        const formData = new URLSearchParams();
        formData.append('horse_name', name || "");
        formData.append('mother_name', mother || "");
        formData.append('father_name', father || "");
        formData.append('sex', sex || "");
        const res = await fetch('/nominate', { method: 'POST', body: formData });
        return { status: res.status, text: await res.text() };
    },
    async postMCAction(url) {
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error("MC操作に失敗しました");
        return await res.json();
    }
};