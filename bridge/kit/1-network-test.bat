@echo off
call "%~dp0config.bat"
echo == IP addresses of this PC (look for 192.168.0.x = the cell network) ==
ipconfig | findstr /i "adapt IPv4"
echo.
echo == Can this PC reach the broker? TcpTestSucceeded must be True ==
powershell -NoProfile -Command "Test-NetConnection -ComputerName '%MQTT_HOST%' -Port %MQTT_PORT% | Format-List ComputerName,RemoteAddress,RemotePort,TcpTestSucceeded"
echo.
echo == Can this PC reach the PLC (%PLC_IP%)? ==
ping -n 2 %PLC_IP%
echo.
pause
