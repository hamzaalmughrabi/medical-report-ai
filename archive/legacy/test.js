const apiUrl = 'https://medical-ai-backend-ipnc.onrender.com/config';

async function testFetch() {
    try {
        console.log('Fetching', apiUrl);
        const res = await fetch(apiUrl);
        if (!res.ok) {
            console.error('HTTP Error', res.status, res.statusText);
            return;
        }
        const data = await res.json();
        console.log('Success!', data);
    } catch (err) {
        console.error('Fetch Failed', err.message);
    }
}

testFetch();
