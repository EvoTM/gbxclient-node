import { EventEmitter as Events } from "events";
import * as net from "net";
import eventToPromise from "event-to-promise";
import { Readable } from "stream";
const Serializer = require("xmlrpc/lib/serializer");
const Deserializer = require("xmlrpc/lib/deserializer");
export class GbxClient extends Events {
  host: string;
  port: number;
  isConnected: boolean;
  reqHandle: number;
  private socket: net.Socket | null;

  /**
   * Creates an instance of GbxClient.
   * @memberof GbxClient
   */
  public constructor() {
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
  async connect(host?: string, port?: number): Promise<boolean> {
    this.host = host || "127.0.0.1";
    this.port = port || 5000;
    this.socket = net.connect(this.port, this.host);
    this.setupListeners();
    return await eventToPromise(this, "connect");
  }

  private setupListeners() {
    this.socket?.on("data", (data) => {
      // first datas, handshake
      if (this.isConnected == false) {
        let headerSize = data.readUIntLE(0, 4);
        let header = data.slice(4).toString();
        if (header.length !== headerSize && header !== "GBXRemote 2") {
          this.socket?.end();
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
        deserializer.deserializeMethodResponse(
          Readable.from(response),
          (err: any, res: any) => {
            this.emit(`response:${requestHandle}`, [res, err]);
          }
        );
      } else {
        deserializer.deserializeMethodCall(
          Readable.from(response),
          (err: any, method: any, res: any) => {
            this.emit("callback", method, res);
            this.emit(method, res);
          }
        );
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
  async call(method: string, ...params: any) {
    let xml = Serializer.serializeMethodCall(method, params);
    return await this.query(xml);
  }

  /**
   * execute a script method call
   *
   * @param {string} method
   * @param {...any} params
   * @returns any
   * @memberof GbxClient
   */
  async callScript(method: string, ...params: any) {
    return await this.call("TriggerModeScriptEventArray", method, params);
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
  async multicall(methods: Array<any>) {
    let params: any = [];
    for (let method of methods) {
      params.push({ methodName: method.shift(), params: method });
    }

    let xml = Serializer.serializeMethodCall("system.multicall", [params]);

    let out = [];
    for (let answer of await this.query(xml)) {
      out.push(answer[0]);
    }
    return out;
  }

  private async query(xml: string) {
    // if request is more than 4mb
    if (xml.length + 8 > 4 * 1024 * 1024) {
      return new Error(
        "transport error - request too large (" + xml.length + ")"
      );
    }
    this.reqHandle++;
    let len = Buffer.byteLength(xml);
    let buf = Buffer.alloc(8 + len);
    buf.writeInt32LE(len, 0);
    buf.writeUInt32LE(this.reqHandle, 4);
    buf.write(xml, 8);
    this.socket?.write(buf, "utf8");
    let response = await eventToPromise(this, `response:${this.reqHandle}`);

    if (response[1]) {
      throw response[1];
    }
    return response[0];
  }
  /**
   * Disconnect
   *
   * @returns Promise<true>
   * @memberof GbxClient
   */
  async disconnect(): Promise<true> {
    this.socket?.end();
    this.isConnected = false;
    return true;
  }
}
