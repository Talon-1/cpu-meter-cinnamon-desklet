# cpu-meter desklet
Desklet to show CPU/RAM statistics in a single graph.

![image](https://raw.githubusercontent.com/Talon-1/cpu-meter-cinnamon-desklet/main/cpu-meter@Talon-1/screenshot.png)

This project is my own HEAVY modification derived from system-monitor-graph@rcassani

# Features

| System variable | Description |
| -----------     | ----------- |
| CPU             | CPU usage in % Cores in parenthesis |
| RAM             | Used RAM as % of total, and in GB |
| Temperature     | CPU Temp reported in Celsius |

Each cores individual load is represented by one of eight configurable colors.
If your CPU has more than 8 cores, the modulus of the core index by 8 is used to recycle the same colors

Example: core 8 is the same color as core 1, core 9 is the same color as core 2, etc...

The Math:

CoreIndex % 8 = Number between 0-7

8 % 8 = 0 (Color1)

9 % 8 = 1 (Color2)

Even if you had a lot of cores:

104 % 8 = 0 (Color1)

105 % 8 = 1 (Color2)

![image](https://raw.githubusercontent.com/Talon-1/cpu-meter-cinnamon-desklet/main/cpu-meter@Talon-1/cpudesklet-options.png)

# About

CPU usage derived from /proc/stat

RAM usage derived from /proc/meminfo

Temperature derived from console command: "sensors"
