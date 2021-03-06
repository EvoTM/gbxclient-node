var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { EventEmitter as Events } from "events";
import * as net from "net";
import eventToPromise from "event-to-promise";
import { Readable } from "stream";
const Serializer = require("xmlrpc/lib/serializer");
const Deserializer = require("xmlrpc/lib/deserializer");
export class GbxClient extends Events {
    /**
     * Creates an instance of GbxClient.
     * @memberof GbxClient
     */
    constructor() {
        super();
        this.isConnected = false;
        this.reqHandle = 0x80000000;
        this.host = "";
        this.port = 5000;
        this.socket = null;
    }
    /**
     * Connects to trackmania server
     * supports currently trackamanias with GBXRemote 2 protocol:
     * Trackmania Nations Forever / Maniaplanet / Trackmania 2020
     *
     * @param {string} [host]
     * @param {number} [port]
     * @returns {Promise<boolean>}
     * @memberof GbxClient
     */
    connect(host, port) {
        return __awaiter(this, void 0, void 0, function* () {
            this.host = host || "127.0.0.1";
            this.port = port || 5000;
            this.socket = net.connect(this.port, this.host);
            this.setupListeners();
            return yield eventToPromise(this, "connect");
        });
    }
    setupListeners() {
        var _a;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.on("data", (data) => {
            var _a;
            // first datas, handshake
            if (this.isConnected == false) {
                let headerSize = data.readUIntLE(0, 4);
                let header = data.slice(4).toString();
                if (header.length !== headerSize && header !== "GBXRemote 2") {
                    (_a = this.socket) === null || _a === void 0 ? void 0 : _a.end();
                    console.log("handshake mismatch");
                    this.emit("connect", false);
                    process.exit(0);
                }
                this.isConnected = true;
                this.emit("connect", true);
                return;
            }
            let responseLength = data.readUInt32LE(0);
            let requestHandle = data.readUInt32LE(4);
            let response = data.slice(8).toString();
            // console.log(responseLength, requestHandle, response);
            let deserializer = new Deserializer();
            if (requestHandle > 0x80000000) {
                deserializer.deserializeMethodResponse(Readable.from(response), (err, res) => {
                    this.emit(`response:${requestHandle}`, [res, err]);
                });
            }
            else {
                deserializer.deserializeMethodCall(Readable.from(response), (err, method, res) => {
                    this.emit("callback", method, res);
                    this.emit(method, res);
                });
            }
        });
    }
    /**
     * execute a xmlrpc method call on a server
     *
     * @param {string} method
     * @param {...any} params
     * @returns any
     * @memberof GbxClient
     */
    call(method, ...params) {
        return __awaiter(this, void 0, void 0, function* () {
            let xml = Serializer.serializeMethodCall(method, params);
            return yield this.query(xml);
        });
    }
    /**
     * execute a script method call
     *
     * @param {string} method
     * @param {...any} params
     * @returns any
     * @memberof GbxClient
     */
    callScript(method, ...params) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.call("TriggerModeScriptEventArray", method, params);
        });
    }
    /**
     * perform a multicall
     *
     * @example await gbx.multicall([
     *                              ["Method1", param1, param2, ...],
     *                              ["Method2", param1, param2, ...],
     *                              ...
     *                              ])
     *
     * @param {Array<any>} methods
     * @returns Array<any>
     * @memberof GbxClient
     */
    multicall(methods) {
        return __awaiter(this, void 0, void 0, function* () {
            let params = [];
            for (let method of methods) {
                params.push({ methodName: method.shift(), params: method });
            }
            let xml = Serializer.serializeMethodCall("system.multicall", [params]);
            let out = [];
            for (let answer of yield this.query(xml)) {
                out.push(answer[0]);
            }
            return out;
        });
    }
    query(xml) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // if request is more than 4mb
            if (xml.length + 8 > 4 * 1024 * 1024) {
                return new Error("transport error - request too large (" + xml.length + ")");
            }
            this.reqHandle++;
            let len = Buffer.byteLength(xml);
            let buf = Buffer.alloc(8 + len);
            buf.writeInt32LE(len, 0);
            buf.writeUInt32LE(this.reqHandle, 4);
            buf.write(xml, 8);
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.write(buf, "utf8");
            let response = yield eventToPromise(this, `response:${this.reqHandle}`);
            if (response[1]) {
                throw response[1];
            }
            return response[0];
        });
    }
    /**
     * Disconnect
     *
     * @returns Promise<true>
     * @memberof GbxClient
     */
    disconnect() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.end();
            this.isConnected = false;
            return true;
        });
    }
}
