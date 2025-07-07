const designs = [{"DisplayName":"ベルベット禿鷹\nω=8.3, PM=-19.9°","PMOrd":1,"WgcOrd":17,"kp":10,"kd":1,"ph":0.9216589861751151,"Name":"DRONE1"},{"DisplayName":"銀河のゲーマー\nω=4.6, PM=-18.7°","PMOrd":2,"WgcOrd":10,"kp":2.5,"kd":0.25,"ph":0.89093701996927788,"Name":"DRONE2"},{"DisplayName":"輝くヤモリ🦎\nω=152.5, PM=1.8°","PMOrd":3,"WgcOrd":31,"kp":30,"kd":450,"ph":0.86021505376344076,"Name":"DRONE3"},{"DisplayName":"風のゼブラ\nω=0.7, PM=1.8°","PMOrd":4,"WgcOrd":1,"kp":0.05,"kd":0.0125,"ph":0.82949308755760354,"Name":"DRONE4"},{"DisplayName":"寿司忍者🍣\nω=101.6, PM=2.2°","PMOrd":5,"WgcOrd":29,"kp":200,"kd":200,"ph":0.79877112135176642,"Name":"DRONE5"},{"DisplayName":"ホログラフィックホーク\nω=113.6, PM=2.4°","PMOrd":6,"WgcOrd":30,"kp":25,"kd":250,"ph":0.7680491551459292,"Name":"DRONE6"},{"DisplayName":"ピクセル海賊\nω=101.6, PM=2.5°","PMOrd":7,"WgcOrd":28,"kp":100,"kd":200,"ph":0.73732718894009208,"Name":"DRONE7"},{"DisplayName":"月夜の夢追い人\nω=71.8, PM=3.1°","PMOrd":8,"WgcOrd":26,"kp":100,"kd":100,"ph":0.70660522273425486,"Name":"DRONE8"},{"DisplayName":"月光マナティー\nω=88.0, PM=3.1°","PMOrd":9,"WgcOrd":27,"kp":10,"kd":150,"ph":0.67588325652841774,"Name":"DRONE9"},{"DisplayName":"量子クオッカ\nω=19.9, PM=4.2°","PMOrd":10,"WgcOrd":22,"kp":26,"kd":7.8,"ph":0.64516129032258052,"Name":"DRONE10"},{"DisplayName":"ウィムジカルウルフ\nω=7.0, PM=5.0°","PMOrd":11,"WgcOrd":15,"kp":4,"kd":1,"ph":0.6144393241167434,"Name":"DRONE11"},{"DisplayName":"忍者ペンギン\nω=45.3, PM=5.5°","PMOrd":12,"WgcOrd":25,"kp":20,"kd":40,"ph":0.58371735791090618,"Name":"DRONE12"},{"DisplayName":"輝くアライグマ🦝\nω=24.7, PM=6.5°","PMOrd":13,"WgcOrd":23,"kp":24,"kd":12,"ph":0.55299539170506906,"Name":"DRONE13"},{"DisplayName":"星屑スズメ\nω=16.2, PM=6.7°","PMOrd":14,"WgcOrd":21,"kp":15,"kd":5.25,"ph":0.52227342549923184,"Name":"DRONE14"},{"DisplayName":"電気象\nω=27.6, PM=9.6°","PMOrd":15,"WgcOrd":24,"kp":3,"kd":15,"ph":0.49155145929339472,"Name":"DRONE15"},{"DisplayName":"雷鳴のライオン\nω=7.9, PM=10.5°","PMOrd":16,"WgcOrd":16,"kp":4.04,"kd":1.3291600000000001,"ph":0.46082949308755755,"Name":"DRONE16"},{"DisplayName":"雪の結晶\nω=14.4, PM=14.8°","PMOrd":17,"WgcOrd":20,"kp":4.08,"kd":4.19832,"ph":0.43010752688172038,"Name":"DRONE17"},{"DisplayName":"ターボタートル\nω=9.1, PM=17.7°","PMOrd":18,"WgcOrd":18,"kp":3,"kd":1.7999999999999998,"ph":0.39938556067588321,"Name":"DRONE18"},{"DisplayName":"風船職人🎈\nω=4.7, PM=19.6°","PMOrd":19,"WgcOrd":11,"kp":1.3,"kd":0.559,"ph":0.36866359447004604,"Name":"DRONE19"},{"DisplayName":"星の騎士\nω=10.3, PM=21.6°","PMOrd":20,"WgcOrd":19,"kp":1.5,"kd":2.25,"ph":0.33794162826420887,"Name":"DRONE20"},{"DisplayName":"光の魔術師\nω=4.4, PM=23.5°","PMOrd":21,"WgcOrd":9,"kp":1,"kd":0.5,"ph":0.3072196620583717,"Name":"DRONE21"},{"DisplayName":"エコーエルク\nサイバー侍\nω=2.8, PM=24.5°","PMOrd":22,"WgcOrd":4,"kp":0.5,"kd":0.25,"ph":0.27649769585253453,"Name":"DRONE22"},{"DisplayName":"侍寿司\nフラミンゴの戯れ\n機知のウォンバット\n夢見るイルカ\nω=6.5, PM=28.1°","PMOrd":23,"WgcOrd":14,"kp":1,"kd":1,"ph":0.24577572964669736,"Name":"DRONE23"},{"DisplayName":"神秘の人魚🧜‍♀️\nω=6.4, PM=32.6°","PMOrd":24,"WgcOrd":13,"kp":0.5,"kd":1,"ph":0.21505376344086019,"Name":"DRONE24"},{"DisplayName":"星雲のナルワール\nω=6.4, PM=34.9°","PMOrd":25,"WgcOrd":12,"kp":0.25,"kd":1,"ph":0.18433179723502302,"Name":"DRONE25"},{"DisplayName":"竹のパンダ\nω=4.2, PM=35.9°","PMOrd":26,"WgcOrd":8,"kp":0.5,"kd":0.5,"ph":0.15360983102918585,"Name":"DRONE26"},{"DisplayName":"宇宙猫🐱\nω=4.0, PM=38.7°","PMOrd":27,"WgcOrd":7,"kp":0.4,"kd":0.48,"ph":0.12288786482334868,"Name":"DRONE27"},{"DisplayName":"笑うラマ\nω=1.7, PM=40.4°","PMOrd":28,"WgcOrd":2,"kp":0.15,"kd":0.15,"ph":0.09216589861751151,"Name":"DRONE28"},{"DisplayName":"謎の鷲\nω=2.1, PM=41.2°","PMOrd":29,"WgcOrd":3,"kp":0.2,"kd":0.2,"ph":0.06144393241167434,"Name":"DRONE29"},{"DisplayName":"ささやきの柳\nω=3.8, PM=41.9°","PMOrd":30,"WgcOrd":6,"kp":0.3,"kd":0.44999999999999996,"ph":0.03072196620583717,"Name":"DRONE30"},{"DisplayName":"フェニックスの炎🔥\nω=2.8, PM=46.5°","PMOrd":31,"WgcOrd":5,"kp":0.2,"kd":0.30000000000000004,"ph":0,"Name":"DRONE31"}];

const height = 2;
const cycle = 8;
const spd = 1;

function spawnDrone(d) {
    let x0 = d.WgcOrd * 2;
    let z0 = d.PMOrd * 1;
    simulator.spawn(d.DisplayName, (state, t) => {
        let ry = height, rz = 0, drz = 0;
        let phase = t % cycle;
        if (phase < cycle / 2) {
            rx = phase * spd;
            drx = spd;
        } else {
            rx = (cycle - phase) * spd;
            drx = -spd;
        }
        let y = state.position.y;
        let dy = state.velocity.y;
        let x = state.position.x - x0;
        let dx = state.velocity.x;
        let z = state.position.z - z0;
        let dz = state.velocity.z;
        let angle = state.rotationQuaternion.toEulerAngles();
        let uy = (9.81 + 10 * ((ry - y) + 1 * (0 - dy)));
        let ux = d.kp * (rx - x) + d.kd * (drx - dx);
        let uz = d.kp * (rz - z) + d.kd * (drz - dz);
        let uyaw = -10 * angle.y - 10 * state.angularVelocity.y;
        return {
            angularRates: new BABYLON.Vector3(uz, uyaw, -ux),
            throttle: uy
        };
    }, {
        position: new BABYLON.Vector3(x0, height, z0)
    });
}

simulator.despawnAll();
simulator.pause();
simulator.resetTime();

designs.forEach((design, i) => {
    spawnDrone(design);
});

simulator.setCameraPosition(19, 15, 9);
simulator.setCameraRotation(0.7, 0, 0);