package org.ardupilot.bluetooth.classic

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

@InvokeArg
class ConnectArgs {
    val address: String = ""
}

@InvokeArg
class SendArgs {
    val data: List<Int> = emptyList()
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.BLUETOOTH_CONNECT],
            alias = "bluetoothConnect"
        ),
        Permission(
            strings = [Manifest.permission.BLUETOOTH_SCAN],
            alias = "bluetoothScan"
        )
    ]
)
class ClassicBluetoothPlugin(private val activity: android.app.Activity) : Plugin(activity) {

    private var socket: BluetoothSocket? = null
    private var inputStream: InputStream? = null
    private var outputStream: OutputStream? = null
    private var readThread: Thread? = null

    private fun hasBluetoothPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    private fun getAdapter(): BluetoothAdapter? {
        val manager = activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    // -----------------------------------------------------------------------
    // Permission request command
    // -----------------------------------------------------------------------

    @Command
    fun requestBtPermissions(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            invoke.resolve()
            return
        }

        val aliases = mutableListOf<String>()
        if (getPermissionState("bluetoothConnect")?.toString() != "granted") {
            aliases.add("bluetoothConnect")
        }
        if (getPermissionState("bluetoothScan")?.toString() != "granted") {
            aliases.add("bluetoothScan")
        }

        if (aliases.isEmpty()) {
            invoke.resolve()
            return
        }

        requestPermissionForAliases(aliases.toTypedArray(), invoke, "btPermissionsCallback")
    }

    @PermissionCallback
    private fun btPermissionsCallback(invoke: Invoke) {
        val result = JSObject()
        result.put("bluetoothConnect", getPermissionState("bluetoothConnect")?.toString() ?: "denied")
        result.put("bluetoothScan", getPermissionState("bluetoothScan")?.toString() ?: "denied")
        invoke.resolve(result)
    }

    // -----------------------------------------------------------------------
    // Bluetooth Classic commands
    // -----------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    @Command
    fun getBondedDevices(invoke: Invoke) {
        if (!hasBluetoothPermission()) {
            invoke.reject("BLUETOOTH_CONNECT permission not granted")
            return
        }

        val adapter = getAdapter()
        if (adapter == null) {
            invoke.reject("Bluetooth not available")
            return
        }

        val devices = JSArray()
        for (device: BluetoothDevice in adapter.bondedDevices) {
            val obj = JSObject()
            obj.put("name", device.name ?: "Unknown")
            obj.put("address", device.address)
            devices.put(obj)
        }

        val result = JSObject()
        result.put("devices", devices)
        invoke.resolve(result)
    }

    @SuppressLint("MissingPermission")
    @Command
    fun connect(invoke: Invoke) {
        if (!hasBluetoothPermission()) {
            invoke.reject("BLUETOOTH_CONNECT permission not granted")
            return
        }

        val args = invoke.parseArgs(ConnectArgs::class.java)
        if (args.address.isEmpty()) {
            invoke.reject("address is required")
            return
        }

        val adapter = getAdapter()
        if (adapter == null) {
            invoke.reject("Bluetooth not available")
            return
        }

        // Disconnect previous connection if any
        disconnectInternal()

        // RFCOMM connect is blocking — run off the main thread
        Thread {
            try {
                val device = adapter.getRemoteDevice(args.address)
                val sock = device.createRfcommSocketToServiceRecord(SPP_UUID)
                adapter.cancelDiscovery()
                sock.connect()

                socket = sock
                inputStream = sock.inputStream
                outputStream = sock.outputStream

                // Start read loop
                readThread = Thread {
                    val buf = ByteArray(4096)
                    try {
                        while (!Thread.currentThread().isInterrupted) {
                            val bytesRead = inputStream?.read(buf) ?: -1
                            if (bytesRead == -1) break
                            val data = buf.copyOf(bytesRead)
                            val event = JSObject()
                            event.put("data", Base64.encodeToString(data, Base64.NO_WRAP))
                            trigger("data", event)
                        }
                    } catch (e: IOException) {
                        // Socket closed or error — stop reading
                    }
                }
                readThread?.isDaemon = true
                readThread?.start()

                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject("Failed to connect: ${e.message}")
            }
        }.start()
    }

    @Command
    fun disconnect(invoke: Invoke) {
        disconnectInternal()
        invoke.resolve()
    }

    @Command
    fun send(invoke: Invoke) {
        val args = invoke.parseArgs(SendArgs::class.java)
        if (args.data.isEmpty()) {
            invoke.reject("data is required")
            return
        }

        val bytes = ByteArray(args.data.size)
        for (i in args.data.indices) {
            bytes[i] = args.data[i].toByte()
        }

        try {
            outputStream?.write(bytes)
            outputStream?.flush()
            invoke.resolve()
        } catch (e: IOException) {
            invoke.reject("Failed to send: ${e.message}")
        }
    }

    private fun disconnectInternal() {
        readThread?.interrupt()
        readThread = null
        try { inputStream?.close() } catch (_: IOException) {}
        try { outputStream?.close() } catch (_: IOException) {}
        try { socket?.close() } catch (_: IOException) {}
        inputStream = null
        outputStream = null
        socket = null
    }

    override fun onDestroy() {
        disconnectInternal()
        super.onDestroy()
    }
}
