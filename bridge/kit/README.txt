Robot cell digital twin - bridge kit
====================================

Receives the PLC packets (UDP 5005) and publishes them to the MQTT broker.
Nothing to install: unzip anywhere (Desktop or a USB drive) and double-click
the .bat files in order. Each one stops at the first failure.

  1-network-test.bat       IP of this PC, broker reachable on 8883?, PLC reachable?
  2-python-test.bat        does the portable Python run here?
  3-broker-test.bat        connect, log in and publish one test message
  4-test-with-fake-plc.bat whole path with a fake PLC (no real PLC needed)
  5-run-bridge.bat         the real bridge, for the real PLC

Steps 3, 4 and 5 ask for the MQTT user and password. The password is not
saved anywhere.

Settings (broker, PLC IP, firewall workaround): config.bat.
Need help? Give AI-CONTEXT.md to an AI assistant together with the error.
