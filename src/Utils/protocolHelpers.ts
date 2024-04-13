import net from 'net';

async function isPortAvailable (port: number): Promise<boolean> {
    return new Promise((resolve) => {
        let server = net.createServer((socket) => {
            socket.on('error', (error) => {
                // console.log('Error on isPortAvailable: ', error);
                resolve(false);
            });
        });

        server.on('error', (error) => {
            // console.log('Error on isPortAvailable: ', error);
            resolve(false);
        });

        server.on('listening', () => {
            server.close();
            // console.log('Port is available');
            resolve(true);
        });
        server.listen({port: port});        
    });
}

function randomIntFromInterval(min:number, max:number) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export async function getTCPOpenPort (startFrom?: number) : Promise<number> {


    let min = 49152;
    let max = 65535;

    if(!startFrom) startFrom = randomIntFromInterval(min, max);

    let i = startFrom
    let openPort: number|null = null;
    while (i <= max || !!openPort) {
        let portAvailable = await isPortAvailable(i);
        if (portAvailable) {
            openPort = i;
            break;
        }
        i++;
    }
    if (openPort === null) {
        i = startFrom - 1;
        while (i >= min || !!openPort) {  
            let portAvailable = await isPortAvailable(i);
            if (portAvailable) {
                openPort = i;
                break;
            }
            i--;
        }   
    }

    return new Promise((resolve, reject) => {
        if(openPort === null) {
            reject('Could not secure a port.');
        } else {
            resolve(openPort);
        }
    });
};

