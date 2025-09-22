const fs = require('fs');

function execute() {
    try {
        const code = fs.readFileSync('code.js', 'utf8');
        const args = JSON.parse(fs.readFileSync('args.json', 'utf8'));

        // Wrap the code in a function
        const func = new Function('...args', `
            ${code}
        `);

        const result = func(...args);

        // Handle promises
        if (result && typeof result.then === 'function') {
            result.then(resolvedResult => {
                const output = JSON.stringify({ result: resolvedResult });
                console.log(output);
            }).catch(e => {
                const errorOutput = JSON.stringify({ error: e.toString() });
                console.error(errorOutput);
                process.exit(1);
            });
        } else {
            const output = JSON.stringify({ result: result });
            console.log(output);
        }

    } catch (e) {
        const errorOutput = JSON.stringify({ error: e.toString() });
        console.error(errorOutput);
        process.exit(1);
    }
}

execute();
