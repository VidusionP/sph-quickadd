import $ from 'jquery';
import _, { min } from 'lodash';
import swal from 'sweetalert2';
import utils from '@bigcommerce/stencil-utils';

//sandbox : 998
//us: 5229
//ca: 3165
var allureException = [
    "coco",
    "rose",
    "adele",
    "angelina",
    "jessica",
    "selena",
    "taylor",
    "julia",
    "nicole",
    "gwyneth",
    "ev7914",
    "tl6814",
    "ev5714",
    "mo5514",
    "mo7608",
    "ev5512",
    "ev5706",
    "ev6810",
    "eg6612",
    "eh16",
    "mh2206",
    "sh5206",
    "ep3608",
    "mh2216",
    "maya",
    "noya",
];
var enableSITimer;
var shippingItem = null;
var shippingItems = null;
var cartItems = null;
var sku = "SKUSI";
var skus=[];
var teamdeskItems = null;
var teamdeskPOItems = null;
var redirectUrl = "/checkout";
var sioParam;
var pShippingGroup={};
var isPopup=false;

/**
 * @summary Find the months difference
 * 
 * @param {Date} d1 Time to compare
 * @param {Date} d2 Time to compare
 * @returns Months difference. Value is 0 if d1 later than d2
 */
function monthDiff(d1, d2) {
    var months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
}

function findShippingInsurance(arr) {
    let result = [];
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].sku.includes("SKUSI")) {
            result.push(arr[i]);
        }
    }
    if (result.length == 0) {
        return null;
    } else {
        return result;
    }
}

/**
 * Get the inventory and po from teamdesk
 */
function cartGetDelivery() {
    if (cartItems) {
        // console.log(cartItems);
        skus = cartItems.lineItems.physicalItems.map(i=>{
            let sku = i.sku;
            if (sku.indexOf("_N")==sku.length-2) {
                sku = sku.slice(0,sku.length-2);                
            }
            return encodeURIComponent(sku);
        });
        fetch(`//shp-webserver.glitch.me/get-teamdesk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: 'application/json'
            },
            body: JSON.stringify({
                table: 'Inventory',
                filter: `Any([SKU],'${skus.join(",")}')`
            })
        })
        .then(r=>r.json())
        .then(r=>{
            teamdeskItems = r;            
            fetch(`//shp-webserver.glitch.me/get-teamdesk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    table: 't_763479',
                    options: `?filter=Any([SKU],'${skus.join(",")}') and [Incoming Quantity]>0 and [Arrival Due Date]>ToDate('1/1/1')&sort=Arrival Due Date//ASC`                        
                })
            })
            .then(r=>r.json())
            .then(r=>{
                teamdeskPOItems = r;
                cartSetDelivery();
            })
            .catch(e=>{
                console.log(e);
                cartSetDelivery();
            })
        })
        .catch(e=>console.log(e));
    }
}

/**
 * Fill in the delivery information
 */
function cartSetDelivery() {    
    if (teamdeskItems) {
        let qtyChecked=[];        
        for (let [index, sku] of skus.entries()) {          
            if (sku.indexOf("_N")==sku.length-2) {
                sku = sku.slice(0,sku.length-2);                
            }  
            let item = teamdeskItems.find(s=>encodeURIComponent(s.SKU.toUpperCase())==sku.toUpperCase());            
            if (item) {                
                if ($(".productList").find("li.productList-item").eq(index).find("ul.product-options").find(".cart-delivery").length==0) {
                    let qty = cartItems.lineItems.physicalItems[index].quantity;                    
                    let buff = 0;
                    if (qtyChecked[item.SKU]) {
                        buff = qtyChecked[item.SKU];
                        qtyChecked[item.SKU]+=qty;
                    } else {
                        qtyChecked[item.SKU]=qty;
                    }
                    let content=`<strong>Estimated ship out time:</strong><br/>`;

                    if (item["Total On Hand"] == item["Available Quantity"]) {
                        if (Number(item["Quantity USA"])>0) {
                            if (Number(item["Quantity USA"])-buff>0) {
                                content+=`Immediately: quantity <strong>${Math.min(item["Quantity USA"]-buff, qty)}</strong><br/>`;
                                qty = qty - Math.min(item["Quantity USA"]-buff, qty);
                                buff=0;
                            } else {
                                buff-=Number(item["Quantity USA"]);
                            }
                        }
                        if (Number(item["Quantity Canada"])>0 && qty>0) {
                            if (Number(item["Quantity Canada"])-buff>0) {
                                content+=`2-4 days: quantity <strong>${Math.min(item["Quantity Canada"]-buff, qty)}</strong><br/>`;
                                qty = qty - Math.min(item["Quantity Canada"]-buff, qty);
                                buff=0;
                            } else {
                                buff -= Number(item["Quantity Canada"]);
                            }
                        }
                    } else {
                        if (Number(item["Available Quantity"])>0) {
                            if (Number(item["Available Quantity"])-buff>0) {
                                content+=`1-4 days: quantity <strong>${Math.min(item["Available Quantity"]-buff, qty)}</strong><br/>`;
                                qty = qty - Math.min(item["Available Quantity"]-buff, qty);
                                buff=0;
                            } else {
                                buff -= Number(item["Available Quantity"]);
                            }
                        }
                    }
                    if (item["Virtual Quantity"] && qty>0) {                            
                        if (item["Lock Status"]!="Locked for processing" && Number(item["Unlocked for sale quantity"]) > 0 && qty>0) {
                            if (Number(item["Unlocked for sale quantity"])-buff > 0) {                                    
                                content+=`1 week later: quantity <strong>${Math.min(item["Unlocked for sale quantity"]-buff, qty)}</strong><br/>`;                                    
                                qty = qty - Math.min(item["Unlocked for sale quantity"]-buff, qty);                                    
                                buff=0;
                            } else {
                                buff-=Number(item["Unlocked for sale quantity"]);
                            }
                        }
                        let virtual={};                        
                        if (Number(item["Quantity Incoming"])-2 > 0 && qty>0) {
                            if (Number(item["Quantity Incoming"])-2 -buff > 0) {
                                let inItems = teamdeskPOItems.filter(p=>p.SKU.toUpperCase() == item["SKU"].toUpperCase());
                                let i=0, totalP=buff, tempqty = qty;
                                while (i<inItems.length && tempqty>0) {
                                    totalP+=Number(inItems[i]["Incoming Quantity"]);
                                    tempqty = tempqty - Math.min(Number(inItems[i]["Incoming Quantity"]), tempqty);
                                    i++;                                
                                }
                                if (i>0) {
                                    let inItem = inItems[i-1];                                    
                                    let mdiff = monthDiff(new Date(), new Date(inItem["Arrival Due Date"]));
                                    if (mdiff==0) {                                    
                                        if (allureException.includes(inItem["Part Number"])) {
                                            mdiff+=3;
                                        } else {
                                            mdiff+=1;
                                        }
                                    } else if (allureException.includes(inItem["Part Number"])) {
                                        mdiff+=2;
                                    }
                                    virtual[mdiff] = Math.min(totalP, qty);                                        
                                    qty = tempqty;
                                    buff=0;
                                }
                            } else {
                                buff = buff - Number(item["Quantity Incoming"]) + 2;
                            }
                        }
                        if (qty>0) {
                            let m = item["Virtual Location"].slice(0,-1);
                            if (virtual[m]) {
                                virtual[m]+=qty;
                            } else {
                                virtual[m]=qty;
                            }
                        }
                        // console.log(virtual);
                        if (Object.keys(virtual).length > 0) {
                            const options = {year: 'numeric', month: 'long'};
                            let vkeys = Object.keys(virtual).sort(function(a,b) {
                                return b-a;
                            })                
                            for (let key of vkeys) {
                                if (Number(key)) {
                                    let date = new Date();
                                    date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                                    date.setMonth(date.getMonth()+Number(key));
                                    content+=`${date.toLocaleDateString('en-US', options)}: quantity <strong>${virtual[key]}</strong><br/>`;
                                } else {
                                    content+=`${key.replace("_","-")} months later: quantity <strong>${virtual[key]}</strong><br/>`;
                                }
                            }
                        }
                    } 

                    if ($(".productList").find("li.productList-item").eq(index).find("ul.product-options").length>0) {
                        $(".productList").find("li.productList-item").eq(index).find("ul.product-options").append(`<li class="product-option cart-delivery">${content}</li>`);
                    } else {                        
                        $(".productList").find("li.productList-item").eq(index).find(".product-body").append(`
                            <ul class="product-options"><li class="product-option cart-delivery">${content}</li></ul>
                        `);
                    }
                } else {
                    let qty = cartItems.lineItems.physicalItems[index].quantity;
                    if (qtyChecked[item.SKU]) {                        
                        qtyChecked[item.SKU]+=qty;
                    } else {
                        qtyChecked[item.SKU]=qty;
                    }
                }
            } else if ($(".productList").find("li.productList-item").eq(index).find("ul.product-options").find(".cart-delivery").length==0) {
                var cmhRushItems = ['CMH', 'CMLACE', 'CMMONO', 'CMLACEPOLY', 'CMSKIN'];
                var hairService = [
                    "style#221",
                    "style#222",
                    "style#231",
                    "style#232",
                    "style#233",
                    "style#234",
                    "style#251",
                    "style#331",
                    "style#332",
                    "style#334",
                    "style#335",
                    "style#341",
                    "style#342",
                    "style#343",
                    "style#551",
                    "style#552",
                    "Style #Your_Own",
                    "Online Services Pack",
                    ];
                let content = "";
                if (cmhRushItems.includes(sku.toUpperCase())) {
                    content=`<strong>Estimated ship out time:</strong><br/>3-month guaranteed delivery<br/>`;
                } else if (hairService.includes(sku)) {
                    content=`<strong>Estimated ship out time:</strong><br/>Handling time 1-2 weeks<br/>`;
                }                 
                $(".productList").find("li.productList-item").eq(index).find("ul.product-options").append(`<div class="cart-delivery">${content}</div>`);
            }
        }
    }    
}

/**
 * Show custom loading 
 * 
 * @param {string} content HTML string content
 */
function showLoading(content) {
    if ($(".loadingNotification.customLoading").length==0) {
        $(".layout-main").append(`
        <div class="loadingNotification customLoading">
            <div class="loadingNotification-label optimizedCheckout-loadingToaster">
                <div class="spinner" />
                <span class="label">
                    ${content}
                </span>
            </div>
        </div>
    `);
    } else {
        updateLoadingContent(content);
    }
}

/**
 * Hide custom loading
 */
function hideLoading() {    
    $(".layout-main .loadingNotification.customLoading").remove();
}

/**
 * Update content of custom loading
 * 
 * @param {string} content HTML string content
 */
function updateLoadingContent(content) {
    if ($(".layout-main .loadingNotification.customLoading").length>0) {
        $(".layout-main .loadingNotification.customLoading").find(".label").html(content);
    } else {
        showLoading(content);
    }
}

/**
 * Get parameters of url
 * 
 * @param {string} name Name of query parameter
 * @param {string} url URL to check
 * @returns {string} Value of parameter
 */
function getParameterByName(name, url = window.location.href) {
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

/**
 * Update Shipping Insurance once the selection is clicked
 * 
 * @param {DOM} element DOM element which is clicked
 */
function updateSI(element) {
    if (element.checked) {        
        showLoading("Updating Shipping Insurance");
        let totalAmount = cartItems.baseAmount;
        let insurance = Math.floor(totalAmount*0.01);
        let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);
        $.get(url, function(data) {
            if (isPopup) {
                location.href = "/checkout?popup=true";
            } else {
                location.href = "/checkout";
            }            
        });
    } else {
        swal({
            text: "You will NOT be covered for your order in case it is lost, damaged or stolen. Are you sure to remove this option?",
            type: 'warning',
            showCancelButton: true,
        }).then(() => {
            // remove item from cart
            showLoading("Removing Shipping Insurance");
            cartRemoveSI(0, shippingItems, function() {                      
                if (isPopup) {
                    location.href = "/checkout?sio=true&popup=true";
                } else {
                    location.href = "/checkout?sio=true";
                }
            })
        });        
    }
}

/**
 * Embed Shipping Insurance checkbox
 * 
 * @param {boolean} isChecked True is needed to be checked, false if it is uncheck
 */
function embeddedSI(isChecked) {    
    //console.log(shippingItem);
    if ($(".cart-section.si-section").length == 0) {                
        if (isChecked) {
            $(".cart-section")
            .eq(1)
            .before(
                '<section class="cart-section optimizedCheckout-orderSumary-cartSection si-section"><input type="checkbox" id="enableSI" name="enableSI" checked="true" onChange="changeSI();"/><label for="enableSI" class="enableSI-label">Enable Shipping Insurance</label></section>'
            );
        } else {
            $(".cart-section")
            .eq(1)
            .before(
                '<section class="cart-section optimizedCheckout-orderSumary-cartSection si-section"><input type="checkbox" id="enableSI" name="enableSI" onChange="changeSI();"/><label for="enableSI" class="enableSI-label">Enable Shipping Insurance</label></section>'
            );            
        }
        $(".cart-section.si-section").find("input").on("change", function() {
            updateSI(this);
        })
    }
}
/**
 * @summary Remove Shipping Items from cart
 * 
 * @param {integer} idx Index of current Shipping Item
 * @param {Array} shippingItems Array of Shipping Item
 * @param {function} callback Call back function after done deleting 
 * @returns void
 */
function cartRemoveSI(idx, shippingItems, callback) {        
    if (idx==shippingItems.length) {
        callback();
    } else {
        utils.api.cart.itemRemove(shippingItems[idx].id, (err, removedData) => {
            if (err) {
                return;
            }
            cartRemoveSI(idx+1, shippingItems, callback);
        })
    }
}

/**
 * Check Shipping Insurance
 */
function cartCheckSI() {
    let totalAmount = cartItems.baseAmount;
    shippingItems = findShippingInsurance(cartItems.lineItems.physicalItems);        
    if (shippingItems) {
        if (shippingItems.length>1) {
            updateLoadingContent("Updating Shipping Insurance");
            let salePrice = shippingItems.reduce((a,b)=>a+b.salePrice,0);
            let totalWithoutShipping = totalAmount - salePrice;            
            cartRemoveSI(0, shippingItems, function() {                        
                if (totalWithoutShipping>=1000) {
                    let insurance = Math.floor(totalWithoutShipping*0.01);
                    let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);        
                    $.get(url, function(data) {                                
                        if (isPopup) {
                            location.href = "/checkout?popup=true"
                        } else {
                            location.href = "/checkout"
                        }
                    });
                } else {
                    if (isPopup) {
                        location.href = "/checkout?popup=true"
                    } else {
                        location.href = "/checkout"
                    }
                }
            })
        } else {
            let salePrice = shippingItems[0].salePrice;
            let totalWithoutShipping = totalAmount - salePrice;
            let insurance = Math.floor(totalWithoutShipping*0.01);               
            if (insurance!=Math.ceil(salePrice)) {
                updateLoadingContent("Updating Shipping Insurance");
                cartRemoveSI(0, shippingItems, function() {                            
                    if (totalWithoutShipping>=1000) {                                
                        let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);                                   
                        $.get(url, function(data) {                                    
                            if (isPopup) {
                                location.href = "/checkout?popup=true"
                            } else {
                                location.href = "/checkout"
                            }
                        });                                
                    } else {
                        if (isPopup) {
                            location.href = "/checkout?popup=true"
                        } else {
                            location.href = "/checkout"
                        }
                    }
                })
            } else {
                hideLoading();
                if (totalWithoutShipping>=1000 && totalWithoutShipping<2000) {
                    embeddedSI(true);
                }
                if (teamdeskItems) {
                    cartSetDelivery();
                } else {
                    cartGetDelivery();
                }
            }
        }
    } else {
        if (totalAmount>=1000 && totalAmount<2000) {
            const sioParam = getParameterByName('sio');
            if (sioParam) {                
                $("#cart-edit-link").attr("href", "/cart.php?sio=true");
                hideLoading();
                if (teamdeskItems) {
                    cartSetDelivery();
                } else {
                    cartGetDelivery();
                }
                embeddedSI(false);
            } else {
                let insurance = Math.floor(totalAmount*0.01);
                let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);
                updateLoadingContent("Updating Shipping Insurance");
                $.get(url, function(data) {                            
                    if (isPopup) {
                        location.href = "/checkout?popup=true"
                    } else {
                        location.href = "/checkout"
                    }
                });
            }
        } else if (totalAmount>=2000) {
            let insurance = Math.floor(totalAmount*0.01);
            if (insurance<=106) {
                let url = "/cart.php?action=add&sku=SKUSI-"+(insurance-9);
                updateLoadingContent("Updating Shipping Insurance");
                $.get(url, function(data) {                            
                    if (isPopup) {
                        location.href = "/checkout?popup=true"
                    } else {
                        location.href = "/checkout"
                    }
                });
            } else {
                hideLoading();
                if (teamdeskItems) {
                    cartSetDelivery();
                } else {
                    cartGetDelivery();
                }
            }
        } else {
            hideLoading();
            if (teamdeskItems) {
                cartSetDelivery();
            } else {
                cartGetDelivery();
            }
        }
    }
}

/**
 * Get and Check the products of cart
 */
function checkProducts() {
    let token = $("[name=store-token]").val();
    console.log(cartItems);
    if (cartItems) {
        let ids = cartItems.lineItems.physicalItems.map(i=>i.productId);        
        fetch('/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query: `
            query SeveralProductsByID {
                site {
                    products(entityIds: [${ids.join(",")}]) {
                        edges {
                            node {
                                name
                                sku
                                entityId
                                metafields (namespace: "shipping.shipperhq") {
                                    edges {
                                        node {
                                            key
                                            value
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            ` })
        })
        .then(data => data.json())
        .then(data=>{            
            if (data.data) {
                for (let product of data.data.site.products.edges) {
                    let shippingGroup = null;
                    if (product.node.metafields.edges.length>0) {
                        for (let group of product.node.metafields.edges) {
                            if (group.node.key == "shipping-groups") {
                                shippingGroup = group.node.value;
                                break;
                            }
                        }
                    }                    
                    pShippingGroup[product.node.entityId] = shippingGroup;
                }
                let totalSI=0, totalhp=0;                

                for (let item of cartItems.lineItems.physicalItems) {
                    if (item.sku.includes("SKUSI")) {
                        totalSI+=item.salePrice;                                                               
                    } else {                        
                        if (pShippingGroup[item.productId]) {
                            if (pShippingGroup[item.productId].toLowerCase().includes("hairpiece")) {
                                totalhp += item.quantity;
                            }
                        }         
                    }
                }                
                setShipment((cartItems.baseAmount - totalSI)>500 || totalhp>2);
            } else {
                setShipment();
            }
        })
        .catch(error => {
            console.error(error);
            setShipment();
        });
    }
}

/**
 * Check and set shipment
 * 
 * @param {boolean} isLarger True if having more than 2 pieces of hairpieces or subtotal larger than 500
 */
function setShipment(isLarger=false) {    
    let group = $("[name=customer-group]").val();
    switch (group) {
        case "Newcomer":
            if (isLarger) {
                if (isPopup==false) {
                    swal({
                        text: "As a new client, some restrictions are placed on your account for your first three orders. After your first three orders, restrictions on your cart total will be removed. If you would like to pay using a credit card, please reduce your cart total to under $500.00, or reduce the number of hairpieces in your cart to 2 or less.",
                        type: 'info',                        
                    })
                    isPopup=true;
                }                
                setInterval(() => {
                    $(".checkout-step--payment").find(".checkout-view-content").length > 0 &&
                        $(".checkout-step--payment")
                        .find(".checkout-view-content")
                        .find("li.form-checklist-item")
                        .filter(function () {
                            return (
                                $(this).find(".paymentProviderHeader-name").eq(0).text().toLowerCase().includes("credit card") || $(this).find("#radio-applepay").length>0
                            );
                        })
                        .css("display", "none");
                    
                        if ($(".checkout-step--payment").find(".checkout-view-content").length>0 && 
                        $(".checkout-step--billing").find(".checkout-view-content").length==0 && 
                        $(".checkout-step--shipping").find(".checkout-view-content").length==0 && 
                        $(".checkout-step--customer").find(".checkout-view-content").length==0) {
                            if ($(".checkout-step--shipping").find(".country-name").text() != $(".checkout-step--billing").find(".country-name").text() ||
                            $(".checkout-step--shipping").find(".address-line-1").text() != $(".checkout-step--billing").find(".address-line-1").text() ||
                            $(".checkout-step--shipping").find(".locality").text() != $(".checkout-step--billing").find(".locality").text() ||
                            $(".checkout-step--shipping").find(".postal-code").text().replaceAll(' ','') != $(".checkout-step--billing").find(".postal-code").text().replaceAll(' ','') ||
                            $(".checkout-step--shipping").find(".region").text() != $(".checkout-step--billing").find(".region").text()) {                                                                                
                                $(".billing-reminder").remove();
                                $(".checkout-step--billing").find("button[type='button']").trigger("click");
                                $(".checkout-step--billing").find(".checkout-view-header").after("<div class='billing-reminder'>Billing address should be the same as shipping address</div>");
                                $(".billing-reminder").css({"margin-left": "4.19231rem", "color": "#b30000", "font-size": "1.2rem"});
                            } else {                            
                                $(".billing-reminder").remove();
                            }                       
                        }
                }, 500);
            } else {
                setInterval(() => {                                        
                    if ($(".checkout-step--payment").find(".checkout-view-content").length>0 && 
                    $(".checkout-step--billing").find(".checkout-view-content").length==0 && 
                    $(".checkout-step--shipping").find(".checkout-view-content").length==0 && 
                    $(".checkout-step--customer").find(".checkout-view-content").length==0) {
                        if ($(".checkout-step--shipping").find(".country-name").text() != $(".checkout-step--billing").find(".country-name").text() ||
                        $(".checkout-step--shipping").find(".address-line-1").text() != $(".checkout-step--billing").find(".address-line-1").text() ||
                        $(".checkout-step--shipping").find(".locality").text() != $(".checkout-step--billing").find(".locality").text() ||
                        $(".checkout-step--shipping").find(".postal-code").text().replaceAll(' ','') != $(".checkout-step--billing").find(".postal-code").text().replaceAll(' ','') ||
                        $(".checkout-step--shipping").find(".region").text() != $(".checkout-step--billing").find(".region").text()) {                                                                                
                            $(".billing-reminder").remove();
                            $(".checkout-step--billing").find("button[type='button']").trigger("click");
                            $(".checkout-step--billing").find(".checkout-view-header").after("<div class='billing-reminder'>Billing address should be the same as shipping address</div>");
                            $(".billing-reminder").css({"margin-left": "4.19231rem", "color": "#b30000", "font-size": "1.2rem"});
                        } else {                            
                            $(".billing-reminder").remove();
                        }                       
                    }
                }, 500);
            }
            break;
        case 'Blocklist':
            setInterval(() => {
                $(".checkout-step--payment").find(".checkout-view-content").length > 0 &&
                    $(".checkout-step--payment")
                        .find(".checkout-view-content")
                        .find("li.form-checklist-item")
                        .filter(function () {
                            return (
                                $(this).find(".paymentProviderHeader-name").eq(0).text().toLowerCase().includes("credit card") || $(this).find("#radio-applepay").length>0
                            );
                        })
                        .css("display", "none");
            }, 500);
            break;
    }
}

/**
 * Besure some postal code could pay by cash, not all
 */
function ruleCash() {
    setInterval(() => {
        if ($(".checkout-step--shipping").find(".postal-code").length>0) {
            let dlvrZip = "L3P,L3R,L3S,L3T,L4B,L4C,L4H,L4J,L4K,L4L,L4T,L4V,L4W,L4X,L4Y,L4Z,L5A,L5B,L5C,L5E,L5G,L5H,L5J,L5K,L5L,L5M,L5N,L5P,L5R,L5S,L5T,L5V,L5W,L6B,L6C,L6E,L6G,L6H,L6J,L6K,L6L,L6M,L6T,L6V,L6W,L6X,L6Y,L6Z,M1B,M1C,M1E,M1G,M1H,M1J,M1K,M1L,M1M,M1N,M1P,M1R,M1S,M1T,M1V,M1W,M1X,M2H,M2J,M2K,M2L,M2M,M2N,M2P,M2R,M3A,M3B,M3C,M3H,M3J,M3K,M3L,M3M,M3N,M4A,M4B,M4C,M4E,M4G,M4H,M4J,M4K,M4L,M4M,M4N,M4P,M4R,M4S,M4T,M4V,M4W,M4X,M4Y,M5A,M5B,M5C,M5E,M5G,M5H,M5J,M5K,M5L,M5M,M5N,M5P,M5R,M5S,M5T,M5V,M5W,M5X,M6A,M6B,M6C,M6E,M6G,M6H,M6J,M6K,M6L,M6M,M6N,M6P,M6R,M6S,M7A,M7Y,M8V,M8W,M8X,M8Y,M8Z,M9A,M9B,M9C,M9L,M9M,M9N,M9P,M9R,M9V,M9W";
            let tzip = $(".checkout-step--shipping").find(".postal-code").text().trim().substr(0,3);
            let tcountry = $(".checkout-step--shipping").find(".country-name").text();
            if (dlvrZip.includes(tzip.toUpperCase())==false || tcountry.toLowerCase().includes("canada")==false) {
                $(".checkout-step--payment").find(".checkout-view-content").length > 0 &&
                $(".checkout-step--payment")
                    .find(".checkout-view-content")
                    .find("li.form-checklist-item")
                    .filter(function () {
                        return $(this).find(".paymentProviderHeader-name").eq(0).text().toLowerCase().includes("cash");
                    })
                    .css("display", "none");
            }
        }                
    }, 500);
}

window.addEventListener("DOMContentLoaded", function() {    
    xhook.after(function (request, response) {
        //  console.log('xhook after ' + request.url);
        if (request.url.match(/\/internalapi\/v1\/checkout\/customer$/)) {
            if ((status = 200)) {
                if (isPopup) {
                    location.href = "/checkout?popup=true"
                } else {
                    location.href = "/checkout"
                }
            }
        }
    });        
    showLoading("Checking Shipping Insurance");
    utils.api.cart.getCart({}, (err, myCart) => {
        if (err) {
            return;
        }
        if (myCart.length > 0) {            
            let academy = myCart[0].lineItems.physicalItems.filter(item=>item.sku=="academymono" || item.sku=="academylace" || item.sku=="academyskin" || item.sku=='academyExtended' || item.sku=='academyStarter');
            if (academy.length>0) {                
                let sum_academy = academy.reduce((a,b)=>a+b.salePrice,0);
                myCart[0].baseAmount = myCart[0].baseAmount - sum_academy;
            }
            cartItems = {
                id: myCart[0].id,
                baseAmount: myCart[0].baseAmount,
                lineItems: myCart[0].lineItems,
            };
            const popup = getParameterByName('popup');
            if (popup) {
                isPopup = true;
            }
            let group = $("[name=customer-group]").val();
            if (group) {
                if (group == "Blocklist") {
                    setShipment();
                } else {
                    checkProducts();   
                }
            }
            // ruleCash();
            var checkInit = setInterval(() => {
                if ($("#cart-edit-link").length>0 && (".cart-section").length>0) {
                    this.clearInterval(checkInit);
                    cartCheckSI();                    
                    var baction = setInterval(() => {
                        if ($(".cart-actions button").length>0) {
                            clearInterval(baction);
                            $(".cart-actions button").on("click", function() {
                                setTimeout(function() {
                                    cartSetDelivery();
                                }, 500);
                            });
                        }
                    }, 500);
                }
            }, 500);                         
        }
    })
})
