const rad=200;
const height=3;
const spd=1;

function ph2pos(ph) {
    const r = 0.25 / Math.PI;
    ph = ph % 1;
    let x, z, dx, dz;

    if (ph < 0.25) {
        x = r * Math.cos(ph / r);
        z = r * Math.sin(ph / r)+0.25/2;
        dx = -Math.sin(ph / r);
        dz = Math.cos(ph / r);
    } else if (ph < 0.5) {
        x = -r;
        z = -(ph - 0.25)+0.25/2;
        dx = 0.0;
        dz = -1.0;
    } else if (ph < 0.75) {
        x = r * Math.cos(Math.PI + (ph - 0.5) / r);
        z = -0.25/2 + r * Math.sin(Math.PI + (ph - 0.5) / r);
        dx = -Math.sin(Math.PI + (ph - 0.5) / r);
        dz = Math.cos(Math.PI + (ph - 0.5) / r);
    } else {
        x = r;
        z = -0.25/2 + (ph - 0.75);
        dx = 0.0;
        dz = 1.0;
    }

    return { x, z, dx, dz };
}

function spawnDrone(d,i) {
    let ph0 = (50-i) * 1/50;
    let x0 = rad*ph2pos(ph0).x;
    let z0 = rad*ph2pos(ph0).z;
    let dx0 = rad*ph2pos(ph0).dx;
    let dz0 = rad*ph2pos(ph0).dz;

    simulator.spawn(d.DisplayName, (state, t) => {
        
        let ry = height;
        let ph, dph;
        ph = 0.03*t+ph0;

        dph = 0.03;
        if (ph>3) {
            let t0 = (3-ph0)/0.03;
            ph = 3+0.03*(t-t0)*Math.pow(1.2,0.03*(t-t0));
            dph = 0.03*Math.pow(1.2,0.03*(t-t0))+0.03*(t-t0)*0.03*Math.log(1.2)*Math.pow(1.2,0.03*(t-t0));
        }
        
        let rx = rad*ph2pos(ph).x, rz = rad*ph2pos(ph).z;
        let drx = dph*rad*ph2pos(ph).dx, drz = dph*rad*ph2pos(ph).dz;
    
        let kp,kd;

        if(ph<2+0.3){
            kp=0.2;
            kd=kp*0.6;
        }else{
            kp=d.kp;
            kd=d.kd;
        }

        let y = state.position.y;
        let dy = state.velocity.y;
        let x = state.position.x;
        let dx = state.velocity.x;
        let z = state.position.z;
        let dz = state.velocity.z;
        let angle = state.rotationQuaternion.toEulerAngles();
        let uy = (9.81 + 10 * ((ry - y) + 1 * (0 - dy)));
        let ux = kp * (rx - x) + kd * (drx - dx);
        let uz = kp * (rz - z) + kd * (drz - dz);
        let uyaw = -10 * angle.y - 10 * state.angularVelocity.y;

        if (y < 0) {
            return {
                action: 'stop',
                reason: 'crashed at round '+(ph-2.3).toFixed(2)
            };
        }

        if ((rx-x)*(rx-x)+(ry-y)*(ry-y) > 5*5) {
            return {
                action: 'stop',
                reason: 'dropped at round '+(ph-2.3).toFixed(2)
            };
        }

        return {
            rollYawRatePitch: new BABYLON.Vector3(uz, uyaw, -ux),
            throttle: uy
        };
    }, {
        position: new BABYLON.Vector3(x0, height, z0),
    });
}

simulator.despawnAll();
simulator.pause();
simulator.resetTime();

const designs = [{"DisplayName":"AeroGuide\nω=4.1, PM=-32.0°","PMOrd":1,"WgcOrd":23,"kp":2.03,"kd":0.070238,"ph":0.9291521486643437},{"DisplayName":"Yolo03\nω=2.9, PM=-0.7°","PMOrd":2,"WgcOrd":17,"kp":0.8,"kd":0.16000000000000003,"ph":0.90592334494773508},{"DisplayName":"EdgeFlux\nω=4.2, PM=5.6°","PMOrd":3,"WgcOrd":25,"kp":1.5,"kd":0.375,"ph":0.88269454123112656},{"DisplayName":"Yolo01\nω=2.7, PM=9.9°","PMOrd":4,"WgcOrd":15,"kp":0.6,"kd":0.18,"ph":0.85946573751451794},{"DisplayName":"Ctrl2\nω=12.2, PM=15.5°","PMOrd":5,"WgcOrd":38,"kp":4.1,"kd":3.0749999999999997,"ph":0.83623693379790931},{"DisplayName":"Ctrl1\nω=12.5, PM=15.9°","PMOrd":6,"WgcOrd":39,"kp":3.8,"kd":3.23,"ph":0.81300813008130068},{"DisplayName":"Ctrl3\nω=12.5, PM=16.1°","PMOrd":7,"WgcOrd":40,"kp":3.6,"kd":3.24,"ph":0.78977932636469217},{"DisplayName":"Roslyn\nω=13.0, PM=20.5°","PMOrd":8,"WgcOrd":41,"kp":0.01,"kd":3.5,"ph":0.76655052264808354},{"DisplayName":"Sigma01\nω=6.3, PM=20.9°","PMOrd":9,"WgcOrd":30,"kp":1.76,"kd":0.93280000000000007,"ph":0.74332171893147492},{"DisplayName":"Pengu\nω=10.3, PM=21.6°","PMOrd":10,"WgcOrd":37,"kp":1.5,"kd":2.25,"ph":0.7200929152148664},{"DisplayName":"Sigma02\nω=6.9, PM=23.9°","PMOrd":11,"WgcOrd":31,"kp":1.52,"kd":1.1096,"ph":0.69686411149825778},{"DisplayName":"Yolo02\nω=2.5, PM=24.0°","PMOrd":12,"WgcOrd":14,"kp":0.4,"kd":0.2,"ph":0.67363530778164915},{"DisplayName":"Sigma03\nω=8.2, PM=25.4°","PMOrd":13,"WgcOrd":33,"kp":1.12,"kd":1.5120000000000002,"ph":0.65040650406504064},{"DisplayName":"Edge31\nω=10.0, PM=25.9°","PMOrd":14,"WgcOrd":36,"kp":0.0171,"kd":2.1375,"ph":0.627177700348432},{"DisplayName":"Garsa\nω=9.6, PM=26.8°","PMOrd":15,"WgcOrd":35,"kp":0.01,"kd":2,"ph":0.60394889663182338},{"DisplayName":"Utah9\nω=5.4, PM=27.3°","PMOrd":16,"WgcOrd":28,"kp":1.04,"kd":0.7384,"ph":0.58072009291521476},{"DisplayName":"Edge41\nω=8.7, PM=29.1°","PMOrd":17,"WgcOrd":34,"kp":0.0168,"kd":1.67982864,"ph":0.55749128919860624},{"DisplayName":"Edge51\nEdge52\nω=7.8, PM=31.7°","PMOrd":18,"WgcOrd":32,"kp":0.014,"kd":1.3998656,"ph":0.53426248548199762},{"DisplayName":"Tulio11\nω=3.8, PM=37.3°","PMOrd":19,"WgcOrd":20,"kp":0.44,"kd":0.4444,"ph":0.511033681765389},{"DisplayName":"Drix\nω=6.0, PM=38.8°","PMOrd":20,"WgcOrd":29,"kp":0.01,"kd":0.9,"ph":0.48780487804878042},{"DisplayName":"J2\nω=5.1, PM=40.0°","PMOrd":21,"WgcOrd":27,"kp":0.22,"kd":0.6996,"ph":0.46457607433217185},{"DisplayName":"Koba40\nω=2.0, PM=40.4°","PMOrd":22,"WgcOrd":10,"kp":0.19,"kd":0.1843,"ph":0.44134727061556328},{"DisplayName":"J1\nω=2.3, PM=41.2°","PMOrd":23,"WgcOrd":13,"kp":0.22,"kd":0.22,"ph":0.41811846689895465},{"DisplayName":"SoftGain\nω=2.1, PM=41.2°","PMOrd":24,"WgcOrd":11,"kp":0.2,"kd":0.2,"ph":0.39488966318234608},{"DisplayName":"Rix\nω=4.4, PM=43.1°","PMOrd":25,"WgcOrd":26,"kp":0.2,"kd":0.55999999999999994,"ph":0.37166085946573746},{"DisplayName":"Jax\nω=3.4, PM=43.3°","PMOrd":26,"WgcOrd":18,"kp":0.27,"kd":0.378,"ph":0.34843205574912889},{"DisplayName":"Apini5\nω=4.0, PM=43.5°","PMOrd":27,"WgcOrd":21,"kp":0.24,"kd":0.48239999999999994,"ph":0.32520325203252032},{"DisplayName":"2025/10/01\nω=4.1, PM=44.3°","PMOrd":28,"WgcOrd":24,"kp":0.2,"kd":0.5,"ph":0.30197444831591169},{"DisplayName":"Koba48\nω=2.0, PM=48.0°","PMOrd":29,"WgcOrd":7,"kp":0.137,"kd":0.1918,"ph":0.27874564459930312},{"DisplayName":"Paz\nω=3.5, PM=48.1°","PMOrd":30,"WgcOrd":19,"kp":0.15,"kd":0.405,"ph":0.2555168408826945},{"DisplayName":"J3\nω=4.1, PM=48.6°","PMOrd":31,"WgcOrd":22,"kp":0.05,"kd":0.5,"ph":0.23228803716608593},{"DisplayName":"Pos250\nω=2.0, PM=50.1°","PMOrd":32,"WgcOrd":8,"kp":0.123,"kd":0.19434,"ph":0.20905923344947733},{"DisplayName":"Koba52\nω=2.0, PM=52.0°","PMOrd":33,"WgcOrd":9,"kp":0.11,"kd":0.1969,"ph":0.18583042973286873},{"DisplayName":"2025/10/02\nω=2.8, PM=53.3°","PMOrd":34,"WgcOrd":16,"kp":0.1,"kd":0.30000000000000004,"ph":0.16260162601626016},{"DisplayName":"Pos160\nω=1.0, PM=59.9°","PMOrd":35,"WgcOrd":3,"kp":0.0303,"kd":0.090900000000000009,"ph":0.13937282229965156},{"DisplayName":"2025/10/03\n2025/10/04\nω=2.0, PM=60.6°","PMOrd":36,"WgcOrd":6,"kp":0.05,"kd":0.2,"ph":0.11614401858304296},{"DisplayName":"RobAki\nω=2.2, PM=62.8°","PMOrd":37,"WgcOrd":12,"kp":0.023,"kd":0.22999999999999998,"ph":0.092915214866434365},{"DisplayName":"Pos0570\nω=0.5, PM=70.0°","PMOrd":38,"WgcOrd":2,"kp":0.00578,"kd":0.0458354,"ph":0.06968641114982578},{"DisplayName":"RobBaba\nω=1.5, PM=72.4°","PMOrd":39,"WgcOrd":5,"kp":0.001,"kd":0.15,"ph":0.046457607433217182},{"DisplayName":"RobYama\nω=1.0, PM=77.9°","PMOrd":40,"WgcOrd":4,"kp":1E-6,"kd":0.099999999999999992,"ph":0.023228803716608591},{"DisplayName":"Latitude\nω=0.3, PM=86.4°","PMOrd":41,"WgcOrd":1,"kp":5E-5,"kd":0.025,"ph":0}];

designs.sort((a, b) => a.PMOrd - b.PMOrd).forEach((design, i) => {
    spawnDrone(design, i);
});


simulator.setCameraPosition(-9.7, 3.54, -11.36);
simulator.setCameraRotation(0.22, 6.27, 0);
simulator.resume();
