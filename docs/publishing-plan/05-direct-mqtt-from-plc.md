# Step 5 (optional): MQTT straight from the PLC

Removes the bridge PC. Try it only after steps 1–4 work, because it changes
more of the PLC and may not work on this Runtime version.

## Library

The B&R community library [paho.mqtt.c-ar](https://github.com/br-automation-community/paho.mqtt.c-ar)
(`IotMqtt`) adds an MQTT client with TLS to Automation Runtime. Its only 3.x
build is **H3.10 Intel**, and the cell PLC runs **E3.10**. The README says the
build does not depend strictly on the AR version, so it may load, but this is
untested.

## Blockers

| Blocker | Why | What to do |
|---|---|---|
| Runtime version | Library built for H3.10 | Try it on E3.10 first; upgrading AR on the lab PLC needs the professor's OK |
| No gateway/DNS on IF5 | The PLC cannot reach the internet as configured | Set gateway and DNS in the IF5 settings, or point to a broker IP |
| Cell LAN may have no internet | `192.168.0.x` is likely isolated | Needs a router on the cell LAN, which is a lab infrastructure change |
| TLS load | OpenSSL on an older PP400 CPU | Run it in a slow task class and watch cycle time with the cell running |

## What changes in the twin

Nothing. The PLC publishes the same `robotcell/plc/io` JSON (`IotMqttRegParPublish`
can publish a PV as JSON) and sets the Last Will on `robotcell/source/status`.
