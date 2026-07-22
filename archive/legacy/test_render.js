const fetch = require('node-fetch'); // or use native fetch if Node 18+
async function test() {
    try {
        const res = await fetch('https://medical-ai-backend-ipnc.onrender.com/config');
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Data:", data);
    } catch (e) {
        console.log("Error:", e);
    }
}
test();
