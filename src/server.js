/**
 * - gather up relevant grpcroutes (using hostname and searching for grpcroute with that hostname and/or grpcroutes bound to gateways with that hostname)
 * - determine all the backend refs and resolve (ie: transate k8s services to an endpoints or `Backend`s to endpoints etc)
 *
 */

/**
 * kubectl -n envoy-gateway-system get gateways.gateway.networking.k8s.io envoy-gateway-internal-falcor-grpc -o yaml
 *
 */

const fs = require("fs");
const grpc = require("@grpc/grpc-js");
const { addReflection } = require("grpc-server-reflection");

const args = require("yargs")(process.argv.slice(2))
  .env("GRS")
  .scriptName("$0")
  .usage("$0 [options]")
  .option("log-level", {
    describe: "log level",
    choices: ["error", "warn", "info", "verbose", "debug", "silly"],
  })
  .option("server-address", {
    describe: "listen address for the server",
    type: "string",
    default: "127.0.0.1",
  })
  .option("server-port", {
    describe: "listen port for the server",
    type: "number",
    default: 50051,
  })
  .option("server-socket", {
    describe: "listen socket for the server",
    type: "string",
  })
  .option("server-socket-permissions-mode", {
    describe: "permissions on the socket file for the server",
    type: "string",
    default: "0600", // os default is 755
  })
  .option("descriptor-set", {
    describe: "path to descriptor set bin file",
    type: "string",
    default: "descriptor_set.bin",
  })
  .version()
  .help().argv;

if (!args.serverSocket && !args.serverAddress && !args.serverPort) {
  console.log("must listen on tcp and/or unix socket");
  process.exit(1);
}

function getServer() {
  const server = new grpc.Server();

  return server;
}

// https://grpc.github.io/grpc/node/grpc.Server.html
const grpcServer = getServer();
addReflection(grpcServer, args.descriptorSet);

let bindAddress = "";
let bindSocket = "";
if (args.serverAddress && args.serverPort) {
  bindAddress = `${args.serverAddress}:${args.serverPort}`;
}

if (args.serverSocket) {
  bindSocket = args.serverSocket || "";
  if (!bindSocket.toLowerCase().startsWith("unix://")) {
    bindSocket = "unix://" + bindSocket;
  }
}

const signalMapping = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  5: "SIGTRAP",
  6: "SIGABRT",
  7: "SIGEMT",
  8: "SIGFPE",
  9: "SIGKILL",
  10: "SIGBUS",
  11: "SIGSEGV",
  12: "SIGSYS",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
  16: "SIGURG",
  17: "SIGSTOP",
  18: "SIGTSTP",
  19: "SIGCONT",
  20: "SIGCHLD",
  21: "SIGTTIN",
  22: "SIGTTOU",
  23: "SIGIO",
  24: "SIGXCPU",
  25: "SIGXFSZ",
  26: "SIGVTALRM",
  27: "SIGPROF",
  28: "SIGWINCH",
  29: "SIGINFO",
  30: "SIGUSR1",
  31: "SIGUSR2",
};

[(`SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`)].forEach(
  (eventType) => {
    process.on(eventType, async (code) => {
      let codeNumber = null;
      let codeName = null;
      if (code > 0) {
        codeNumber = code;
        codeName = signalMapping[code];
      } else {
        codeNumber = Object.keys(signalMapping).find(
          (key) => signalMapping[key] === code,
        );
        codeName = code;
      }

      console.log(
        `running server shutdown, exit code: ${codeNumber} (${codeName})`,
      );

      // attempt clean shutdown of in-flight requests
      try {
        await new Promise((resolve, reject) => {
          try {
            csiServer.tryShutdown(() => {
              resolve();
            });
          } catch (e) {
            reject(e);
          }
        });

        console.log(`grpc server gracefully closed all connections`);
      } catch (e) {
        console.log("failed to cleanly shutdown grpc server", e);
      }

      // NOTE: if the shutdown above finishes cleanly the socket will already be removed
      let socketPath = bindSocket;
      socketPath = socketPath.replace(/^unix:\/\//g, "");
      if (socketPath && fs.existsSync(socketPath)) {
        let fsStat = fs.statSync(socketPath);
        if (fsStat.isSocket()) {
          fs.unlinkSync(socketPath);
          console.log(`removed grpc socket ${socketPath}`);
        }
      }

      console.log("server fully shutdown, exiting");
      process.exit(codeNumber);
    });
  },
);

if (process.env.LOG_MEMORY_USAGE == "1") {
  setInterval(() => {
    console.log("logging memory usages due to LOG_MEMORY_USAGE env var");
    const used = process.memoryUsage();
    for (let key in used) {
      console.log(
        `[${new Date()}] Memory Usage: ${key} ${
          Math.round((used[key] / 1024 / 1024) * 100) / 100
        } MB`,
      );
    }
  }, process.env.LOG_MEMORY_USAGE_INTERVAL || 5000);
}

if (process.env.MANUAL_GC == "1") {
  setInterval(() => {
    console.log("gc invoked due to MANUAL_GC env var");
    try {
      if (global.gc) {
        global.gc();
      }
    } catch (e) {}
  }, process.env.MANUAL_GC_INTERVAL || 60000);
}

if (process.env.LOG_GRPC_SESSIONS == "1") {
  setInterval(() => {
    console.log("dumping sessions");
    try {
      console.log(csiServer.sessions);
    } catch (e) {}
  }, 5000);
}

if (require.main === module) {
  (async function () {
    try {
      if (bindAddress) {
        await new Promise((resolve, reject) => {
          grpcServer.bindAsync(
            bindAddress,
            grpc.ServerCredentials.createInsecure(),
            (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            },
          );
        });
      }

      if (bindSocket) {
        let socketPath = bindSocket;
        socketPath = socketPath.replace(/^unix:\/\//g, "");
        if (socketPath && fs.existsSync(socketPath)) {
          let fsStat = fs.statSync(socketPath);
          if (fsStat.isSocket()) {
            fs.unlinkSync(socketPath);
          }
        }

        await new Promise((resolve, reject) => {
          grpcServer.bindAsync(
            bindSocket,
            grpc.ServerCredentials.createInsecure(),
            (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            },
          );
        });

        fs.chmodSync(socketPath, args["server-socket-permissions-mode"]);
      }
    } catch (e) {
      console.log(e);
      process.exit(1);
    }
  })();
}
