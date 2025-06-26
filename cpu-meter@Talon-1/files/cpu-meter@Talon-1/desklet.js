/*-------------------------------------------------------------------------------------------------------------------------------
  CPU Meter By: Talon-1 v1.0

  heavily modified (and commented), stripped down and optimized version of system-monitor-graph@rcassani (only cpu/ram data)
  Many thanks to rcassani for the introduction to creating Desklets! This was only made possible by dissecting his original
  desklet (and reading his blog posts)!

  His Blog posts: 
  https://www.castoriscausa.com/posts/2020/05/12/cinnamon-desklet-development/
  https://www.castoriscausa.com/posts/2020/06/09/system-monitor-graph-desklet/

-------------------------------------------------------------------------------------------------------------------------------*/

const ByteArray = imports.byteArray;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Cairo = imports.cairo;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;

const UUID = "cpu-meter@Talon-1";
const DESKLET_PATH = imports.ui.deskletManager.deskletMeta[UUID].path;

function CpuMeter(metadata, desklet_id) { this._init(metadata, desklet_id); }
function main(metadata, desklet_id) { return new CpuMeter(metadata, desklet_id); }
  
CpuMeter.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

		// initialize settings
		this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], desklet_id);
        this.settings.bindProperty(Settings.BindingDirection.IN, "refresh-interval", "refresh_interval", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "duration", "duration", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "background-color", "background_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "h-midlines", "h_midlines", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "v-midlines", "v_midlines", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "scale-size", "scale_size", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "midline-color", "midline_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "text-color", "text_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-ram", "line_color_ram", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu1", "line_color_cpu1", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu2", "line_color_cpu2", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu3", "line_color_cpu3", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu4", "line_color_cpu4", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu5", "line_color_cpu5", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu6", "line_color_cpu6", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu7", "line_color_cpu7", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu8", "line_color_cpu8", this.on_setting_changed);

		// initialize startup values
		this.first_run = true;
		this.n_values = Math.floor(this.duration / this.refresh_interval * 2) + 1; // Settings of timescale to find how many steps to store
		this.rvalues  = new Array(this.n_values).fill(0.0); // Ram timeline values
		this.values = new Array(); // Filled later with sub-arrays, CPU core timeline values
		this.cpu_cpu_tot = new Array(); // Filled later with sub-arrays, Data-Backlog to compare previous total to current total
		this.cpu_cpu_idl = new Array(); // Filled later with sub-arrays, Data-Backlog to compare previous idle to current idle total
		this.cpu_use = new Array(); // Filled later with sub-arrays, Data-Backlog to compare previous use to current use
		this.cpu_temp = "--°C";
		this.ram_values = [0,0,0]; // Initialize some basic values to avoid undefined/NaN: [total,used,free]
		this.swap_values = [0,0]; // Initialize some basic values to avoid undefined/NaN: [total,used]

		// initialize User Interface
		this.setupUI();
    },

	setupUI: function() {
        // initialize this.canvas
        this.canvas = new Clutter.Actor();
        this.canvas.remove_all_children();
        this.text1 = new St.Label(); // CPU Core Count
        this.text2 = new St.Label(); // CPU Avg Load Percent
        this.text3 = new St.Label(); // CPU Temp
        this.text4 = new St.Label(); // RAM Label
        this.text5 = new St.Label(); // RAM Used Percent
        this.text6 = new St.Label(); // Ram Text (used/total)
        this.canvas.add_actor(this.text1);
        this.canvas.add_actor(this.text2);
        this.canvas.add_actor(this.text3);
        this.canvas.add_actor(this.text4);
        this.canvas.add_actor(this.text5);
        this.canvas.add_actor(this.text6);
        this.setContent(this.canvas);

		// Update!
    	this.update();
	},

	parse_rgba_settings: function(color_str) {
        let colors = color_str.match(/\((.*?)\)/)[1].split(","); // get contents inside brackets: "rgb(...)"
		// Removed un-necessary variables and just embdedded the values directly into the return
        return [parseInt(colors[0])/255, parseInt(colors[1])/255, parseInt(colors[2])/255, (colors.length > 3 ? colors[3] : 1)]; //return [r,g,b,a]
    },

	ToBytes: function(str,binary = true) {
		// Multiply the float value by it's proper suffix index (it's 2^N where N is increments of 10. B=2^0, K = 2^10, M=2^20, etc... Decimal is 10^N where N is increments of 3...)
		if (str.match(/^(\d+(?:.\d+)?)\s*([kmgtpezy]?)i?b$/i)) { return parseFloat(RegExp.$1) * Math.pow((binary ? 2 : 10),"bkmgtpezy".indexOf( (RegExp.$2).toLowerCase().substring(0, 1)) * (binary ? 10 : 3)); }
	},

	FromBytes: function(bytes,scale = 1024) { //Binary-Format default, though chose NOT to include the letter i in the output... Pass 1000 as scale for Decimal-Format...
		let logarithm = (isNaN(bytes) || bytes == 0 ? NaN : Math.log(bytes) / Math.log(scale));
		// Take the scale to the power of the remainder (the decimal, IE: 0.xxx), grab the proper label from the integer (before the decimal)
		return (isNaN(logarithm) ? "0 B" : Math.pow(scale,logarithm % 1).toFixed(2) + " " + ["B","KB","MB","GB","TB","PB","EB","ZB","YB"][Math.floor(logarithm)]);
	},
	  
    update: function() {
		// Desklet proportions
        let unit_size = 15 * this.scale_size * global.ui_scale;  // pixels
        let line_width = unit_size / 15;
        let margin_up = 5 * unit_size;
        let graph_w = 20 * unit_size;
        let graph_h =  6 * unit_size;
        let desklet_w = graph_w + (2 * unit_size);
        let desklet_h = graph_h + (6 * unit_size);
        let textL_size = (4 * unit_size / 3) / global.ui_scale;
        let textR_size = (3 * unit_size / 3) / global.ui_scale;
		let radius = 2 * unit_size / 3;;
        let degrees = Math.PI / 180.0;
        let graph_step = graph_w / (this.n_values -1);

		// Poll to get the CPU/RAM data
		this.get_cpu_use();
		this.get_ram_values();
		this.get_sensors();

		// Update CPU cores usage values
        if (!this.first_run) { // Ignore if first-run is set, to allow get_cpu_use() to fill the empty arrays with sub-arrays of Avg + each core
			for (let h = 0; h < this.cpu_use.length; h++) {
				this.values[h].push(isNaN(this.cpu_use[h] / 100) ? 0 : this.cpu_use[h] / 100);
				this.values[h].shift();
			}
		}

		// Update RAM usage values
		this.rvalues.push(isNaN(this.ram_values[1] / this.ram_values[0]) ? 0 : this.ram_values[1] / this.ram_values[0]);
		this.rvalues.shift();

        // Define variables to colors
		let background_colors = this.parse_rgba_settings(this.background_color);
        let midline_colors = this.parse_rgba_settings(this.midline_color);
		let ram_color = this.parse_rgba_settings(this.line_color_ram);
        let line_colors = ["Average Not Drawn: dummy index", this.parse_rgba_settings(this.line_color_cpu1), this.parse_rgba_settings(this.line_color_cpu2), this.parse_rgba_settings(this.line_color_cpu3), this.parse_rgba_settings(this.line_color_cpu4), this.parse_rgba_settings(this.line_color_cpu5), this.parse_rgba_settings(this.line_color_cpu6), this.parse_rgba_settings(this.line_color_cpu7), this.parse_rgba_settings(this.line_color_cpu8)];

        // Setup Canvas Element to draw on
		if (this.first_run) { // Unlike system-monitor-graph@rcassani, we're going to just invalidate to redraw and re-use our canvas instead of spawning a new one each time and letting JS garbage collection release the old one...
    	    this.canvasElement = new Clutter.Canvas();
	        this.canvasElement.set_size(desklet_w, desklet_h);
        	this.canvasElement.connect('draw', (canvas, ctx, desklet_w, desklet_h)  => {
    	        ctx.save();
	            ctx.setOperator(Cairo.Operator.CLEAR);
            	ctx.paint();
        	    ctx.restore();
    	        ctx.setOperator(Cairo.Operator.OVER);
	            ctx.setLineWidth(2 * line_width);

				// desklet background
        	    ctx.setSourceRGBA(background_colors[0], background_colors[1], background_colors[2], background_colors[3]);
    	        ctx.newSubPath();
	            ctx.arc(desklet_w - radius, radius, radius, -90 * degrees, 0 * degrees);
        	    ctx.arc(desklet_w - radius, desklet_h - radius, radius, 0 * degrees, 90 * degrees);
    	        ctx.arc(radius, desklet_h - radius, radius, 90 * degrees, 180 * degrees);
	            ctx.arc(radius, radius, radius, 180 * degrees, 270 * degrees);
        	    ctx.closePath();
    	        ctx.fill();

  	        	// graph border
        	    ctx.setSourceRGBA(midline_colors[0], midline_colors[1], midline_colors[2], 1);
    	        ctx.rectangle(unit_size, margin_up, graph_w, graph_h);
	            ctx.stroke();

            	// graph V and H midlines
            	ctx.setSourceRGBA(midline_colors[0], midline_colors[1], midline_colors[2], 1);
        	    ctx.setLineWidth(line_width);
    	        for (let i = 1; i < this.v_midlines; i++) {
        	        ctx.moveTo((i * graph_w / this.v_midlines) + unit_size, margin_up);
    	            ctx.relLineTo(0, graph_h);
	                ctx.stroke();
				}
				for (let i = 1; i < this.h_midlines; i++) {
					ctx.moveTo(unit_size, margin_up + i * (graph_h / this.h_midlines));
            	    ctx.relLineTo(graph_w, 0);
        	        ctx.stroke();
    	        }

				// timeseries RAM Used
				ctx.setLineWidth(2 * line_width);
				ctx.setSourceRGBA(ram_color[0], ram_color[1], ram_color[2], 1);
				ctx.moveTo(unit_size, margin_up + graph_h - (this.rvalues[0] * graph_h));
    			for (let i = 1; i < this.n_values; i++) { 
					ctx.curveTo(
						unit_size + ((i - 0.5) * graph_step), margin_up + graph_h - (this.rvalues[i-1] * graph_h), 
						unit_size + ((i - 0.5) * graph_step), margin_up + graph_h - (this.rvalues[i] * graph_h), 
						unit_size + (i * graph_step), margin_up + graph_h - (this.rvalues[i] * graph_h)
					); 
				}
				ctx.stroke();

				// timeseries per CPU Core
				for (let h = 1; h < this.cpu_use.length; h++) {
					let modulus = (h - 1) % 8 + 1; //Array 0 inside values is the top line of /proc/stat which is the AVERAGE of all cores, we don't draw this, it's only used for text Percent usage.
					ctx.setLineWidth(2 * line_width);
	        		ctx.setSourceRGBA(line_colors[modulus][0], line_colors[modulus][1], line_colors[modulus][2], 1);
	        		ctx.moveTo(unit_size, margin_up + graph_h - (this.values[h][0] * graph_h));
	        		for (let i = 1; i < this.n_values; i++) { 
						ctx.curveTo(
						  unit_size + ((i - 0.5) * graph_step), margin_up + graph_h - (this.values[h][i-1] * graph_h), 
						  unit_size + ((i - 0.5) * graph_step), margin_up + graph_h - (this.values[h][i] * graph_h), 
						  unit_size + (i * graph_step), margin_up + graph_h - (this.values[h][i] * graph_h)
						); 
					}
					ctx.stroke();
				}
				return false;
        	});
        	this.canvas.set_content(this.canvasElement);
        	this.canvas.set_size(desklet_w, desklet_h);
			this.canvasElement.invalidate(); // Draw for the 1st time!
		}
		else { this.canvasElement.invalidate(); } // Invalidate canvas to force-redraw.

        // labels: set text, style and position
        this.text1.set_text((this.cpu_use.length - 1 > -1 ? "CPU(" + (this.cpu_use.length - 1) + ")" : "CPU"));
		this.text1.style = "font-size: " + textL_size + "px;" + "color: " + this.text_color + ";";
        this.text1.set_position(Math.round(unit_size), Math.round((2.5 * unit_size) - this.text1.get_height()));

		this.text2.set_text("" + (this.cpu_use[0] == undefined ? 0 : this.cpu_use[0]) + "%");
        this.text2.style = "font-size: " + textL_size + "px;" + "color: " + this.text_color + ";";
        this.text2.set_position(Math.round(this.text1.get_width() + (2 * unit_size)), Math.round((2.5 * unit_size) - this.text2.get_height()));

		this.text3.set_text(this.cpu_temp);
        this.text3.style = "font-size: " + textR_size + "px;" + "color: " + this.text_color + ";"
        this.text3.set_position(Math.round((21 * unit_size) - this.text3.get_width()), Math.round((2.5 * unit_size) - this.text3.get_height()));

		this.text4.set_text("RAM");
		this.text4.style = "font-size: " + textL_size + "px;" + "color: " + this.text_color + ";";
        this.text4.set_position(Math.round(unit_size), Math.round((4.5 * unit_size) - this.text4.get_height()));

		this.text5.set_text("" + (this.ram_values[0] == 0 ? 0 : (100 * this.ram_values[1] / this.ram_values[0]).toFixed(2) + "%"));
        this.text5.style = "font-size: " + textL_size + "px;" + "color: " + this.text_color + ";"
        this.text5.set_position(Math.round(this.text5.get_width() + (2 * unit_size)), Math.round((4.5 * unit_size) - this.text5.get_height()));

		this.text6.set_text(this.FromBytes(this.ram_values[1]) + " / " + this.FromBytes(this.ram_values[0]));
        this.text6.style = "font-size: " + textR_size + "px;" + "color: " + this.text_color + ";"
        this.text6.set_position(Math.round((21 * unit_size) - this.text6.get_width()), Math.round((4.5 * unit_size) - this.text6.get_height()));

		// call this.update() every in refresh_interval seconds (changed to timeout_add which requires millisec, potentially planning on faster updates for more smooth scrolling)
        this.timeout = Mainloop.timeout_add((this.refresh_interval * 1000) / 2, Lang.bind(this, this.update));
    },

    on_setting_changed: function() {
        // settings changed; instant refresh
        Mainloop.source_remove(this.timeout);
        this.first_run = true; // Force First-run boolean again to re-initialize everything again.
        this.update();
	},

	on_desklet_clicked: function() { Util.spawn(['gnome-system-monitor']); }, // Launch system monitor upon clicking anywhere inside the Desklet.
	on_desklet_removed: function() { Mainloop.source_remove(this.timeout); }, // Unload our timer if a user removes this Desklet.

    get_cpu_use: function() {
		// Used only once, so removed the object for it (cpu_file) and just call it directly.
        Gio.file_new_for_path('/proc/stat').load_contents_async(null, (file, response) => {
            let [success, contents, tag] = file.load_contents_finish(response);
            if (success) {
                ByteArray.toString(contents).split("\n").forEach((element,index) => {
					if (element.match(/^cpu\d?\s+/)) {
							let cpu_values = element.split(/\s+/);
							let cpu_idl = parseFloat(cpu_values[4]);
							let cpu_tot = 0;
							for (let i = 1; i < 10; i++) { cpu_tot += parseFloat(cpu_values[i]); } //probably always an integer, but for just incase, (future-proofing) we'll use parseFloat()
							this.cpu_use[index] = (100 * (1 - (cpu_idl - (this.cpu_cpu_idl[index] || 0)) / (cpu_tot - (this.cpu_cpu_tot[index] || 0)))).toFixed(2);
							this.cpu_cpu_tot[index] = cpu_tot;
							this.cpu_cpu_idl[index] = cpu_idl;
						}
				});

				// Initialize values needed in first run
				if (this.first_run) {		
					// Extend log values with new sub-arrays per CPU core
					for (let i = 0; i < this.cpu_use.length; i++) { this.values[i] = new Array(this.n_values).fill(0.0); }
					// clear first run
					this.first_run = false;
				}
			}
            GLib.free(contents);
        });
    },

    get_ram_values: function() {
		// Now used only once, for both ram and swap, so removed the object for it (ram_swap_file) and just call it directly.
        Gio.file_new_for_path('/proc/meminfo').load_contents_async(null, (file, response) => {
            let [success, contents, tag] = file.load_contents_finish(response);
            if(success) {
                let mem = ByteArray.toString(contents);
				// Match float and [kmgtpezy]i?B, pass onto ToBytes to get size in bytes. (future-proofing: Potential for just B? potential > kB?)
				// Unlike system-monitor-graph@rcassani, Using more-precise regex patterns, with use of the //m modifier (multiline) so start/end (^$) anchors work per-line instead of over the entire string.
                let mem_tot = this.ToBytes(mem.match(/^MemTotal\:\s+(\d+(?:.\d+)?\s*[KkMmGgTtPpEeZzYy]?i?[Bb])$/m)[1]);
                let mem_fre = this.ToBytes(mem.match(/^MemFree\:\s+(\d+(?:.\d+)?\s*[KkMmGgTtPpEeZzYy]?i?[Bb])$/m)[1]); // Unused but stored for giggles.
                let mem_usd = mem_tot - this.ToBytes(mem.match(/^MemAvailable\:\s+(\d+(?:.\d+)?\s*[KkMmGgTtPpEeZzYy]?i?[Bb])$/m)[1]);
				this.ram_values = [mem_tot, mem_usd, mem_fre];

				// Unused as-of yet, but decided to grab here and remove the redundant get_swap_values() function... Doesn't hurt to store such minimal text even if we do nothing with it....
                let swap_tot = this.ToBytes(mem.match(/^SwapTotal:\s+(\d+(?:.\d+)?\s*[KkMmGgTtPpEeZzYy]?i?[Bb])$/m)[1]);
                let swap_usd = swap_tot - this.ToBytes(mem.match(/^SwapFree:\s+(\d+(?:.\d+)?\s*[KkMmGgTtPpEeZzYy]?i?[Bb])$/m)[1]);
				this.swap_values = [swap_tot, swap_usd];
            }
            GLib.free(contents);
        });
    },

	get_sensors: function() {
		//['inxi','-sc0'] <== Seems more cpu insensive than jut using 'sensors', unsure if this expression matches every system from 'sensors' ....
        let subprocess = Gio.Subprocess.new(['sensors'],Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);
        subprocess.communicate_utf8_async(null, null, (subprocess, result) => {
            let [, stdout, stderr] = subprocess.communicate_utf8_finish(result);
			stdout.split("\n").some((line) => { 
				if (line.match(/Tctl:\s+\+?(\d+.?(?:\d+)°C)/)) { this.cpu_temp = RegExp.$1; return; }
			});
        });
    },

};