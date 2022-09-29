import $ from 'jquery';

export default function () {
    if (localStorage.getItem('shp-country')) {
    } else {
        fetch(`https://www.cloudflare.com/cdn-cgi/trace`)
            .then((r) => r.text())
            .then((data) => {
                data = data
                    .trim()
                    .split('\n')
                    .reduce(function (obj, pair) {
                        pair = pair.split('=');
                        return (obj[pair[0]] = pair[1]), obj;
                    }, {});
                if (data.loc) {
                    localStorage.setItem('shp-country', data.loc);
                    if (data.loc == 'ES') {
                        setTimeout(function () {
                            $('.popup-country').css({ display: 'flex' });
                            $('.popup-country-title').append('¡Hola!');
                            $('.popup-country-main').append('Parece que nos visitas desde España.<br/>Puedes visitar nuestra página web en España para precios locales y opciones de envío.');

                            $('.popup-country-link').append('¡Llévame ahí!');
                            $('.popup-country-continue').append('<div>No, I am not from Spain</div><div class=popup-country-continue-link>Continue Browsing!</div>');

                            $('.popup-country-link').attr('href', '//superhairpieces.es');

                            $('.popup-country-continue-link').on('click', function () {
                                $('.popup-country').hide();
                            });
                            $('.popup-country-overlay').on('click', function () {
                                $('.popup-country').hide();
                            });
                        }, 3500);
                    } else if (data.loc == 'FR') {
                        setTimeout(function () {
                            $('.popup-country').css({ display: 'flex' });
                            $('.popup-country-title').append('bonjour');
                            $('.popup-country-main').append(
                                "Il semble que vous nous rendiez visite depuis la France.<br/>Vous pouvez consulter notre site web en France pour les prix en Euros et les options d'expédition locales."
                            );

                            $('.popup-country-link').append('emmenez-moi là');
                            $('.popup-country-continue').append('<div>No, I am not from France</div><div class=popup-country-continue-link>Continue Browsing!</div>');

                            $('.popup-country-link').attr('href', '//superhairpieces.fr');

                            $('.popup-country-continue-link').on('click', function () {
                                $('.popup-country').hide();
                            });
                            $('.popup-country-overlay').on('click', function () {
                                $('.popup-country').hide();
                            });
                        }, 3500);
                    } else if (data.loc == 'CA') {
                        setTimeout(function () {
                            $('.popup-country').css({ display: 'flex' });
                            $('.popup-country-title').append('hi there');
                            $('.popup-country-main').append('It looks like you are visiting us from Canada.<br/>You can visit our Canadian website for CAD prices and local shipping options.');

                            $('.popup-country-link').append('take me there');
                            $('.popup-country-continue').append('<div>No, I am not from Canada</div><div class=popup-country-continue-link>Continue Browsing!</div>');

                            $('.popup-country-link').attr('href', '//superhairpieces.ca');

                            $('.popup-country-continue-link').on('click', function () {
                                $('.popup-country').hide();
                            });
                            $('.popup-country-overlay').on('click', function () {
                                $('.popup-country').hide();
                            });
                        }, 3500);
                    } else if (data.loc == 'NL') {
                        setTimeout(function () {
                            $('.popup-country').css({ display: 'flex' });
                            $('.popup-country-title').append('Hallo daar');
                            $('.popup-country-main').append('Het lijkt erop dat u ons vanuit Nederland bezoekt.<br/>U kunt onze Nederlandse website bezoeken voor lokale prijzen en verzendopties.');

                            $('.popup-country-link').append('breng me er naar toe');
                            $('.popup-country-continue').append('<div>No, I am not from NL</div><div class=popup-country-continue-link>Continue Browsing!</div>');

                            $('.popup-country-link').attr('href', '//superhairpieces.nl');

                            $('.popup-country-continue-link').on('click', function () {
                                $('.popup-country').hide();
                            });
                            $('.popup-country-overlay').on('click', function () {
                                $('.popup-country').hide();
                            });
                        }, 3500);
                    }
                }
            })
            .catch((e) => console.log(e));
    }
}
